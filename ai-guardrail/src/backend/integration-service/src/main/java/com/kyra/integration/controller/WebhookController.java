package com.kyra.integration.controller;

import com.kyra.integration.dto.CreateWebhookRequest;
import com.kyra.integration.dto.WebhookDTO;
import com.kyra.integration.dto.WebhookDeliveryDTO;
import com.kyra.integration.service.WebhookService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/v1/webhooks")
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private final WebhookService webhookService;

    @GetMapping
    public ResponseEntity<Page<WebhookDTO>> listWebhooks(
            @RequestParam UUID tenantId,
            @PageableDefault(size = 20) Pageable pageable) {
        log.info("List webhooks for tenant {} page={}", tenantId, pageable.getPageNumber());
        Page<WebhookDTO> webhooks = webhookService.listWebhooks(tenantId, pageable);
        return ResponseEntity.ok(webhooks);
    }

    @PostMapping
    public ResponseEntity<WebhookDTO> createWebhook(
            @Valid @RequestBody CreateWebhookRequest request) {
        log.info("Create webhook for tenant {} url={}", request.getTenantId(), request.getUrl());
        WebhookDTO created = webhookService.createWebhook(request);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<WebhookDTO> updateWebhook(
            @PathVariable UUID id,
            @RequestParam UUID tenantId,
            @Valid @RequestBody CreateWebhookRequest request) {
        log.info("Update webhook {}", id);
        WebhookDTO updated = webhookService.updateWebhook(id, tenantId, request);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteWebhook(
            @PathVariable UUID id,
            @RequestParam UUID tenantId) {
        log.info("Delete webhook {}", id);
        webhookService.deleteWebhook(id, tenantId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/deliveries")
    public ResponseEntity<Page<WebhookDeliveryDTO>> getDeliveries(
            @PathVariable UUID id,
            @PageableDefault(size = 20) Pageable pageable) {
        log.info("Get deliveries for webhook {}", id);
        Page<WebhookDeliveryDTO> deliveries = webhookService.getDeliveries(id, pageable);
        return ResponseEntity.ok(deliveries);
    }
}
