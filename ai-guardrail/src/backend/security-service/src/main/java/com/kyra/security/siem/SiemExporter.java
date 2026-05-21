package com.kyra.security.siem;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kyra.security.model.AuditLog;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * Minimal SIEM forwarder. Sends audit entries to an HTTP endpoint (Splunk HEC,
 * Datadog events, generic webhook) if SIEM_WEBHOOK_URL is set. Fire-and-forget,
 * failures are logged but never block the audit write path.
 */
@Component
@Slf4j
public class SiemExporter {

    private final ObjectMapper json = new ObjectMapper();
    private RestClient rc;

    @Value("${siem.webhook.url:}")
    private String webhookUrl;

    @Value("${siem.webhook.auth-header:}")
    private String authHeader;

    @PostConstruct
    public void init() {
        if (webhookUrl != null && !webhookUrl.isBlank()) {
            rc = RestClient.builder().baseUrl(webhookUrl).build();
            log.info("SIEM exporter enabled → {}", webhookUrl);
        } else {
            log.info("SIEM exporter disabled (no SIEM_WEBHOOK_URL)");
        }
    }

    @Async
    @EventListener
    public void onAuditEvent(AuditEvent ev) {
        if (rc == null) return;
        try {
            Map<String, Object> payload = Map.of(
                "source", "kyra-security",
                "timestamp", ev.log().getCreatedAt() == null ? null : ev.log().getCreatedAt().toString(),
                "tenant_id", ev.log().getTenantId() == null ? null : ev.log().getTenantId().toString(),
                "user_id", ev.log().getUserId() == null ? null : ev.log().getUserId().toString(),
                "action", ev.log().getAction(),
                "resource_type", ev.log().getResourceType() == null ? "" : ev.log().getResourceType(),
                "resource_id", ev.log().getResourceId() == null ? "" : ev.log().getResourceId(),
                "status", ev.log().getStatus(),
                "details", ev.log().getDetails() == null ? Map.of() : ev.log().getDetails()
            );
            var spec = rc.post().contentType(org.springframework.http.MediaType.APPLICATION_JSON);
            if (authHeader != null && !authHeader.isBlank()) {
                int idx = authHeader.indexOf(':');
                if (idx > 0) {
                    spec = spec.header(authHeader.substring(0, idx).trim(), authHeader.substring(idx + 1).trim());
                }
            }
            spec.body(json.writeValueAsString(payload)).retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.debug("SIEM forward failed (non-fatal): {}", e.getMessage());
        }
    }

    public record AuditEvent(AuditLog log) {}
}
