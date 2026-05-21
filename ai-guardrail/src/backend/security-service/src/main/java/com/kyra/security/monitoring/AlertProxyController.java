package com.kyra.security.monitoring;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/v1/monitoring")
@Slf4j
public class AlertProxyController {

    private final RestClient promClient;

    public AlertProxyController(@Value("${services.prometheus.url:http://prometheus:9090}") String promUrl) {
        this.promClient = RestClient.builder().baseUrl(promUrl).build();
    }

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    @GetMapping("/alerts")
    public ResponseEntity<Map<String, Object>> getAlerts(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = promClient.get().uri("/api/v1/alerts").retrieve().body(Map.class);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            log.warn("Prometheus alerts fetch failed: {}", e.getMessage());
            return ResponseEntity.ok(Map.of("status", "error", "error", e.getMessage(),
                    "data", Map.of("alerts", java.util.List.of())));
        }
    }

    @GetMapping("/rules")
    public ResponseEntity<Map<String, Object>> getRules(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> body = promClient.get().uri("/api/v1/rules").retrieve().body(Map.class);
            return ResponseEntity.ok(body);
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("status", "error", "error", e.getMessage(),
                    "data", Map.of("groups", java.util.List.of())));
        }
    }
}
