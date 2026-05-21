package com.kyra.security.search;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kyra.security.model.AuditLog;
import com.kyra.security.siem.SiemExporter;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.Map;

@Component
@Slf4j
public class AuditOpenSearchSink {

    private final ObjectMapper json = new ObjectMapper();
    private RestClient client;

    @Value("${opensearch.url:http://opensearch:9200}")
    private String osUrl;

    @Value("${opensearch.audit-index:kyra-audit}")
    private String index;

    @PostConstruct
    public void init() {
        client = RestClient.builder().baseUrl(osUrl).build();
        // Best-effort index template create (idempotent)
        try {
            String mapping = """
                {
                  "settings": {"number_of_shards": 1, "number_of_replicas": 0},
                  "mappings": {
                    "properties": {
                      "id":           {"type": "keyword"},
                      "tenant_id":    {"type": "keyword"},
                      "user_id":      {"type": "keyword"},
                      "action":       {"type": "keyword"},
                      "resource_type":{"type": "keyword"},
                      "resource_id":  {"type": "keyword"},
                      "status":       {"type": "keyword"},
                      "ip_address":   {"type": "ip"},
                      "user_agent":   {"type": "text"},
                      "details":      {"type": "object", "enabled": true},
                      "entry_hash":   {"type": "keyword"},
                      "created_at":   {"type": "date"}
                    }
                  }
                }
                """;
            client.put().uri("/" + index)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(mapping)
                .retrieve()
                .toBodilessEntity();
            log.info("opensearch audit index ready: {}", index);
        } catch (Exception e) {
            log.debug("opensearch index init: {}", e.getMessage());
        }
    }

    @Async
    @EventListener
    public void onAuditEvent(SiemExporter.AuditEvent ev) {
        if (client == null) return;
        AuditLog a = ev.log();
        try {
            Map<String, Object> doc = Map.of(
                "id", a.getId().toString(),
                "tenant_id", a.getTenantId() == null ? null : a.getTenantId().toString(),
                "user_id", a.getUserId() == null ? null : a.getUserId().toString(),
                "action", a.getAction(),
                "resource_type", a.getResourceType() == null ? "" : a.getResourceType(),
                "resource_id", a.getResourceId() == null ? "" : a.getResourceId(),
                "status", a.getStatus(),
                "details", a.getDetails() == null ? Map.of() : a.getDetails(),
                "entry_hash", a.getEntryHash() == null ? "" : a.getEntryHash(),
                "created_at", a.getCreatedAt() == null ? Instant.now().toString() : a.getCreatedAt().toString()
            );
            client.post().uri("/" + index + "/_doc/" + a.getId())
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(json.writeValueAsString(doc))
                .retrieve()
                .toBodilessEntity();
        } catch (Exception e) {
            log.debug("opensearch index audit failed: {}", e.getMessage());
        }
    }
}
