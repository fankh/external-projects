package com.kyra.security.uba;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/uba")
@RequiredArgsConstructor
public class UbaController {

    private final UbaService uba;
    private final com.kyra.security.permissions.PermissionEvaluator perms;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    public record ObserveReq(UUID tenantId, UUID userId, String ipAddress, String userAgent) {}

    /** Internal hook: auth-service calls this on successful login. No admin check; uses tenant/user from body. */
    @PostMapping("/observe")
    public ResponseEntity<Map<String, Object>> observe(@RequestBody ObserveReq r) {
        List<UserAnomaly> hits = uba.observeLogin(r.tenantId(), r.userId(), r.ipAddress(), r.userAgent());
        return ResponseEntity.ok(Map.of(
                "anomaliesDetected", hits.size(),
                "types", hits.stream().map(UserAnomaly::getAnomalyType).toList()));
    }

    @GetMapping("/top-risk")
    public ResponseEntity<List<UserBehaviorProfile>> topRisk(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(uba.topRiskUsers());
    }

    @GetMapping("/anomalies")
    public ResponseEntity<List<UserAnomaly>> recentAnomalies(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(uba.recentAnomalies());
    }

    @GetMapping("/anomalies/user/{userId}")
    public ResponseEntity<List<UserAnomaly>> forUser(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID userId) {
        requireAdmin(role);
        return ResponseEntity.ok(uba.anomaliesFor(userId));
    }

    public record AckReq(UUID adminId) {}
    @PostMapping("/anomalies/{id}/ack")
    public ResponseEntity<UserAnomaly> ack(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody AckReq r) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "uba", id.toString(), "ack");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(uba.acknowledge(id, r.adminId()));
    }

    @PostMapping("/analyze-malicious/{userId}")
    public ResponseEntity<java.util.Map<String, Object>> analyzeMalicious(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) java.util.UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) java.util.UUID callerTenantId,
            @PathVariable java.util.UUID userId) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "uba", userId.toString(), "analyze");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(uba.analyzeMaliciousPatterns(callerTenantId, userId));
    }
}
