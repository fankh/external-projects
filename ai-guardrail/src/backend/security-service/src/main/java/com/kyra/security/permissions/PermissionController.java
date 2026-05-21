package com.kyra.security.permissions;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/permissions")
@RequiredArgsConstructor
public class PermissionController {

    private final PermissionGrantRepository repo;
    private final PermissionEvaluator evaluator;
    private final AuditService auditService;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    public record CheckReq(UUID tenantId, UUID userId, String role,
                           String resourceType, String resourceId, String action) {}

    /** Public-ish check endpoint — any authenticated user can evaluate their own permission. */
    @PostMapping("/check")
    public ResponseEntity<PermissionEvaluator.Decision> check(
            @RequestHeader(value = "X-User-Id", required = false) UUID callerUserId,
            @RequestHeader(value = "X-User-Role", required = false) String callerRole,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @RequestBody CheckReq r) {
        // If the caller isn't admin, they can only evaluate their own user id
        UUID userId = r.userId() != null ? r.userId() : callerUserId;
        String role = r.role() != null ? r.role() : callerRole;
        UUID tenantId = r.tenantId() != null ? r.tenantId() : callerTenantId;
        if (!"admin".equalsIgnoreCase(callerRole) && callerUserId != null && !callerUserId.equals(userId)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Can only check own permissions");
        }
        return ResponseEntity.ok(evaluator.check(tenantId, userId, role, r.resourceType(), r.resourceId(), r.action()));
    }

    @GetMapping("/grants")
    public ResponseEntity<Page<PermissionGrant>> list(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "100") int size) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"))));
    }

    public record CreateGrantReq(UUID tenantId, PermissionGrant.SubjectType subjectType, String subjectId,
                                 String resourceType, String resourceId, String action,
                                 PermissionGrant.Effect effect, Map<String, Object> conditions,
                                 String description) {}

    @PostMapping("/grants")
    public ResponseEntity<PermissionGrant> create(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestBody CreateGrantReq r) {
        requireAdmin(role);
        if (r.subjectType() == null || r.resourceType() == null || r.action() == null) {
            throw new IllegalArgumentException("subjectType, resourceType, and action are required");
        }
        PermissionGrant g = PermissionGrant.builder()
                .tenantId(r.tenantId())
                .subjectType(r.subjectType().name())
                .subjectId(r.subjectId())
                .resourceType(r.resourceType())
                .resourceId(r.resourceId())
                .action(r.action())
                .effect(r.effect() == null ? "ALLOW" : r.effect().name())
                .conditions(r.conditions())
                .description(r.description())
                .createdBy(callerId)
                .build();
        g = repo.save(g);
        auditService.logAuditEvent(r.tenantId(), callerId, "permission.grant.created",
                "permission_grant", g.getId().toString(),
                Map.of("subjectType", g.getSubjectType(), "subjectId", g.getSubjectId() == null ? "" : g.getSubjectId(),
                       "resourceType", g.getResourceType(), "action", g.getAction(), "effect", g.getEffect()),
                "SUCCESS", null, null);
        return ResponseEntity.ok(g);
    }

    @DeleteMapping("/grants/{id}")
    public ResponseEntity<Map<String, Object>> delete(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @PathVariable UUID id) {
        requireAdmin(role);
        PermissionGrant g = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        repo.deleteById(id);
        auditService.logAuditEvent(g.getTenantId(), callerId, "permission.grant.revoked",
                "permission_grant", id.toString(),
                Map.of("subjectType", g.getSubjectType(),
                       "resourceType", g.getResourceType(), "action", g.getAction()),
                "SUCCESS", null, null);
        return ResponseEntity.ok(Map.of("deleted", id.toString()));
    }
}
