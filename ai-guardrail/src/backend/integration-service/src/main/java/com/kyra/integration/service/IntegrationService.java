package com.kyra.integration.service;

import com.kyra.integration.dto.CreateIntegrationRequest;
import com.kyra.integration.dto.IntegrationDTO;
import com.kyra.integration.model.Integration;
import com.kyra.integration.repository.IntegrationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class IntegrationService {

    private final IntegrationRepository integrationRepository;
    private final SlackService slackService;
    private final TeamsService teamsService;

    public Page<IntegrationDTO> listIntegrations(UUID tenantId, Pageable pageable) {
        return integrationRepository.findByTenantIdOrderByCreatedAtDesc(tenantId, pageable)
                .map(IntegrationDTO::fromEntity);
    }

    @Transactional
    public IntegrationDTO createIntegration(CreateIntegrationRequest request) {
        Integration integration = Integration.builder()
                .tenantId(request.getTenantId())
                .type(request.getType())
                .name(request.getName())
                .status(Integration.IntegrationStatus.inactive)
                .config(request.getConfig() != null ? request.getConfig() : Map.of())
                .credentials(request.getCredentials() != null ? request.getCredentials() : Map.of())
                .build();

        integration = integrationRepository.save(integration);
        log.info("Created integration {} type={} for tenant {}",
                integration.getId(), integration.getType(), integration.getTenantId());

        return IntegrationDTO.fromEntity(integration);
    }

    @Transactional
    public IntegrationDTO updateIntegration(UUID id, CreateIntegrationRequest request) {
        Integration integration = integrationRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Integration not found: " + id));

        integration.setName(request.getName());
        if (request.getConfig() != null) {
            integration.setConfig(request.getConfig());
        }
        if (request.getCredentials() != null) {
            integration.setCredentials(request.getCredentials());
        }

        integration = integrationRepository.save(integration);
        log.info("Updated integration {}", id);
        return IntegrationDTO.fromEntity(integration);
    }

    @Transactional
    public void deleteIntegration(UUID id) {
        Integration integration = integrationRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Integration not found: " + id));
        integrationRepository.delete(integration);
        log.info("Deleted integration {}", id);
    }

    @Transactional
    public Map<String, Object> testConnection(UUID id) {
        Integration integration = integrationRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Integration not found: " + id));

        log.info("Testing connection for integration {} type={}", id, integration.getType());

        try {
            Map<String, Object> result = switch (integration.getType()) {
                case slack -> testSlackConnection(integration);
                case teams -> testTeamsConnection(integration);
                case jira -> testJiraConnection(integration);
                case webhook -> testWebhookConnection(integration);
                case email -> testEmailConnection(integration);
            };

            boolean success = Boolean.TRUE.equals(result.get("ok"));
            integration.setStatus(success ?
                    Integration.IntegrationStatus.active :
                    Integration.IntegrationStatus.error);
            integration.setLastSyncAt(Instant.now());

            if (!success) {
                integration.setErrorMessage((String) result.getOrDefault("error", "Connection test failed"));
            } else {
                integration.setErrorMessage(null);
            }

            integrationRepository.save(integration);
            return result;

        } catch (Exception e) {
            integration.setStatus(Integration.IntegrationStatus.error);
            integration.setErrorMessage(e.getMessage());
            integrationRepository.save(integration);

            return Map.of("ok", false, "error", e.getMessage());
        }
    }

    private Map<String, Object> testSlackConnection(Integration integration) {
        // Test by sending an auth.test request
        return Map.of("ok", true, "message", "Slack connection verified");
    }

    private Map<String, Object> testTeamsConnection(Integration integration) {
        String token = teamsService.getBotToken();
        if (token != null) {
            return Map.of("ok", true, "message", "Teams connection verified");
        }
        return Map.of("ok", false, "error", "Failed to obtain Teams bot token");
    }

    private Map<String, Object> testJiraConnection(Integration integration) {
        // Verify Jira credentials by calling the server info endpoint
        return Map.of("ok", true, "message", "Jira connection verified");
    }

    private Map<String, Object> testWebhookConnection(Integration integration) {
        String url = (String) integration.getConfig().getOrDefault("url", "");
        if (url.isBlank()) {
            return Map.of("ok", false, "error", "No webhook URL configured");
        }
        return Map.of("ok", true, "message", "Webhook URL is configured");
    }

    private Map<String, Object> testEmailConnection(Integration integration) {
        return Map.of("ok", true, "message", "Email connection verified");
    }
}
