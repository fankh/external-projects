package com.kyra.security.keys;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/keys")
@RequiredArgsConstructor
public class TenantKeyController {

    private final TenantKeyService keyService;
    private final com.kyra.security.permissions.PermissionEvaluator perms;

    @GetMapping("/{tenantId}")
    public ResponseEntity<List<TenantKey>> list(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID tenantId) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "encryption-key", tenantId.toString(), "read");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(keyService.listForTenant(tenantId));
    }

    @PostMapping("/{tenantId}/rotate")
    public ResponseEntity<TenantKey> rotate(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID tenantId) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "encryption-key", tenantId.toString(), "rotate");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(keyService.rotate(tenantId, callerId));
    }

    @PostMapping("/reap")
    public ResponseEntity<Map<String, Object>> reapNow(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "encryption-key", null, "reap");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        int n = keyService.reapExpiredPendingKeys();
        return ResponseEntity.ok(Map.of("deactivated", n));
    }
}
