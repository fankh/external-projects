package com.kyra.security.client;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Minimal tenant-service client for retention + audit features. */
@Component
@Slf4j
public class TenantServiceClient {

    private final RestClient restClient;

    public TenantServiceClient(@Value("${services.tenant-service.url:http://tenant-service:8026}") String baseUrl) {
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    /** Returns list of {id, slug, status, settings} for active tenants. */
    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> listActiveTenants() {
        try {
            Map<String, Object> body = restClient.get()
                    .uri("/v1/tenants?status=active&size=500")
                    .retrieve()
                    .body(Map.class);
            if (body == null) return Collections.emptyList();
            Object content = body.get("content");
            if (content instanceof List) return (List<Map<String, Object>>) content;
            return Collections.emptyList();
        } catch (Exception e) {
            log.warn("tenant-service unavailable for retention scan: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public int retentionDaysOrDefault(Map<String, Object> tenant, int defaultDays) {
        Object settings = tenant.get("settings");
        if (settings instanceof Map<?, ?> m) {
            Object v = m.get("auditLogRetentionDays");
            if (v instanceof Number n) return n.intValue();
            if (v instanceof String str) {
                try { return Integer.parseInt(str); } catch (NumberFormatException ignore) {}
            }
        }
        return defaultDays;
    }

    public UUID tenantId(Map<String, Object> tenant) {
        Object id = tenant.get("id");
        if (id == null) return null;
        return UUID.fromString(id.toString());
    }
}
