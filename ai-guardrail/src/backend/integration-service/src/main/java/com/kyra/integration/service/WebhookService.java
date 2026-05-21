package com.kyra.integration.service;

import com.kyra.integration.dto.CreateWebhookRequest;
import com.kyra.integration.dto.WebhookDTO;
import com.kyra.integration.dto.WebhookDeliveryDTO;
import com.kyra.integration.model.Webhook;
import com.kyra.integration.model.WebhookDelivery;
import com.kyra.integration.repository.WebhookDeliveryRepository;
import com.kyra.integration.repository.WebhookRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.reactive.function.client.WebClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class WebhookService {

    private static final int MAX_RETRY_ATTEMPTS = 3;
    private static final int MAX_FAILURE_COUNT = 10;
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    private final WebhookRepository webhookRepository;
    private final WebhookDeliveryRepository deliveryRepository;
    private final WebClient.Builder webClientBuilder;

    public Page<WebhookDTO> listWebhooks(UUID tenantId, Pageable pageable) {
        return webhookRepository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable)
                .map(WebhookDTO::fromEntity);
    }

    @Transactional
    public WebhookDTO createWebhook(CreateWebhookRequest request) {
        Webhook webhook = Webhook.builder()
                .tenantId(request.getTenantId())
                .url(request.getUrl())
                .secret(generateSecret())
                .events(request.getEvents())
                .status(Webhook.WebhookStatus.active)
                .failureCount(0)
                .build();

        webhook = webhookRepository.save(webhook);
        log.info("Created webhook {} for tenant {}", webhook.getId(), request.getTenantId());

        // Return DTO with secret visible only on creation
        WebhookDTO dto = WebhookDTO.fromEntity(webhook);
        return dto;
    }

    @Transactional
    public WebhookDTO updateWebhook(UUID id, UUID tenantId, CreateWebhookRequest request) {
        Webhook webhook = webhookRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NoSuchElementException("Webhook not found: " + id));

        webhook.setUrl(request.getUrl());
        webhook.setEvents(request.getEvents());
        webhook = webhookRepository.save(webhook);

        log.info("Updated webhook {}", id);
        return WebhookDTO.fromEntity(webhook);
    }

    @Transactional
    public void deleteWebhook(UUID id, UUID tenantId) {
        Webhook webhook = webhookRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new NoSuchElementException("Webhook not found: " + id));
        webhookRepository.delete(webhook);
        log.info("Deleted webhook {}", id);
    }

    public Page<WebhookDeliveryDTO> getDeliveries(UUID webhookId, Pageable pageable) {
        return deliveryRepository.findByWebhookIdOrderByDeliveredAtDesc(webhookId, pageable)
                .map(WebhookDeliveryDTO::fromEntity);
    }

    @Transactional
    public void deliverEvent(String eventType, Map<String, Object> payload) {
        List<Webhook> activeWebhooks = webhookRepository.findAll().stream()
                .filter(w -> w.getStatus() == Webhook.WebhookStatus.active)
                .filter(w -> Arrays.asList(w.getEvents()).contains(eventType) ||
                             Arrays.asList(w.getEvents()).contains("*"))
                .toList();

        for (Webhook webhook : activeWebhooks) {
            deliverToWebhook(webhook, eventType, payload, 1);
        }
    }

    private void deliverToWebhook(Webhook webhook, String eventType,
                                   Map<String, Object> payload, int attempt) {
        WebhookDelivery delivery = WebhookDelivery.builder()
                .webhookId(webhook.getId())
                .eventType(eventType)
                .payload(payload)
                .attempt(attempt)
                .deliveredAt(Instant.now())
                .build();

        try {
            String payloadJson = new com.fasterxml.jackson.databind.ObjectMapper()
                    .writeValueAsString(payload);
            String signature = computeHmacSignature(payloadJson, webhook.getSecret());

            var response = webClientBuilder.build()
                    .post()
                    .uri(webhook.getUrl())
                    .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                    .header("X-Kyra-Signature", "sha256=" + signature)
                    .header("X-Kyra-Event", eventType)
                    .header("X-Kyra-Delivery", delivery.getId() != null ?
                            delivery.getId().toString() : UUID.randomUUID().toString())
                    .bodyValue(payloadJson)
                    .retrieve()
                    .toBodilessEntity()
                    .block();

            delivery.setSuccess(true);
            delivery.setResponseStatus(response != null ? response.getStatusCode().value() : 200);
            webhookRepository.resetFailureCount(webhook.getId());

            log.info("Webhook delivery successful: webhook={} event={}", webhook.getId(), eventType);

        } catch (Exception e) {
            delivery.setSuccess(false);
            delivery.setResponseBody(e.getMessage());
            webhookRepository.incrementFailureCount(webhook.getId());

            log.warn("Webhook delivery failed: webhook={} event={} attempt={} error={}",
                    webhook.getId(), eventType, attempt, e.getMessage());

            // Disable webhook if too many failures
            if (webhook.getFailureCount() + 1 >= MAX_FAILURE_COUNT) {
                webhook.setStatus(Webhook.WebhookStatus.disabled);
                webhookRepository.save(webhook);
                log.warn("Webhook {} disabled due to excessive failures", webhook.getId());
            }
        }

        webhook.setLastTriggeredAt(Instant.now());
        webhookRepository.save(webhook);
        deliveryRepository.save(delivery);
    }

    @Scheduled(fixedDelay = 60000) // every 60 seconds
    @Transactional
    public void retryFailedDeliveries() {
        List<Webhook> activeWebhooks = webhookRepository.findAll().stream()
                .filter(w -> w.getStatus() == Webhook.WebhookStatus.active)
                .toList();

        for (Webhook webhook : activeWebhooks) {
            List<WebhookDelivery> failedDeliveries =
                    deliveryRepository.findByWebhookIdAndSuccessFalseAndAttemptLessThan(
                            webhook.getId(), MAX_RETRY_ATTEMPTS);

            for (WebhookDelivery failed : failedDeliveries) {
                log.info("Retrying delivery {} attempt {}", failed.getId(), failed.getAttempt() + 1);
                deliverToWebhook(webhook, failed.getEventType(),
                        failed.getPayload(), failed.getAttempt() + 1);
            }
        }
    }

    private String generateSecret() {
        SecureRandom random = new SecureRandom();
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String computeHmacSignature(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            SecretKeySpec keySpec = new SecretKeySpec(
                    secret.getBytes(StandardCharsets.UTF_8), HMAC_ALGORITHM);
            mac.init(keySpec);
            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("Failed to compute HMAC signature", e);
        }
    }
}
