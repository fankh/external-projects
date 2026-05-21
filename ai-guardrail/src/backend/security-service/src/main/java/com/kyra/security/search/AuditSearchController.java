package com.kyra.security.search;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/audit-search")
@RequiredArgsConstructor
@Slf4j
public class AuditSearchController {

    @Value("${opensearch.url:http://opensearch:9200}")
    private String osUrl;

    @Value("${opensearch.audit-index:kyra-audit}")
    private String index;

    private final com.kyra.security.permissions.PermissionEvaluator perms;

    @GetMapping
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> search(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) java.util.UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) java.util.UUID callerTenantId,
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String action,
            @RequestParam(required = false) String userId,
            @RequestParam(defaultValue = "50") int size) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "audit", null, "search");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());

        // Build a simple bool query
        java.util.List<Map<String, Object>> must = new java.util.ArrayList<>();
        if (q != null && !q.isBlank()) {
            must.add(Map.of("multi_match", Map.of(
                "query", q,
                "fields", List.of("action", "resource_type", "resource_id", "status", "details.*")
            )));
        }
        if (action != null && !action.isBlank()) must.add(Map.of("term", Map.of("action", action)));
        if (userId != null && !userId.isBlank()) must.add(Map.of("term", Map.of("user_id", userId)));
        Map<String, Object> body = must.isEmpty()
            ? Map.of("query", Map.of("match_all", Map.of()), "size", size, "sort", List.of(Map.of("created_at", Map.of("order", "desc"))))
            : Map.of("query", Map.of("bool", Map.of("must", must)), "size", size, "sort", List.of(Map.of("created_at", Map.of("order", "desc"))));

        try {
            RestClient rc = RestClient.builder().baseUrl(osUrl).build();
            Map<String, Object> resp = rc.post().uri("/" + index + "/_search")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class);
            return ResponseEntity.ok(resp == null ? Map.of() : resp);
        } catch (Exception e) {
            return ResponseEntity.ok(Map.of("error", e.getMessage(), "hits", Map.of("hits", List.of())));
        }
    }
}
