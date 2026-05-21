package com.kyra.security.privacy;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.*;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/privacy")
@RequiredArgsConstructor
public class PrivacyController {

    private final PrivacyService service;
    private final PrivacyRequestRepository repo;
    private final com.kyra.security.permissions.PermissionEvaluator perms;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    public record CreateReq(UUID tenantId, UUID userId, UUID requestedBy,
                            PrivacyRequest.Type type, String notes,
                            Map<String, Object> metadata) {}
    public record VerifyReq(UUID adminUserId, String notes) {}
    public record FulfillReq(UUID adminUserId) {}

    @PostMapping("/requests")
    public ResponseEntity<PrivacyRequest> create(@RequestBody CreateReq r) {
        if (r.type() == null || r.userId() == null) {
            throw new IllegalArgumentException("type and userId are required");
        }
        return ResponseEntity.ok(service.createRequest(r.tenantId(), r.userId(),
                r.requestedBy(), r.type(), r.notes(), r.metadata()));
    }

    @GetMapping("/requests/{id}")
    public ResponseEntity<PrivacyRequest> get(@PathVariable UUID id) {
        return service.get(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    /** Subject-user endpoint: my own requests. */
    @GetMapping("/requests")
    public ResponseEntity<List<PrivacyRequest>> listByUser(@RequestParam UUID userId) {
        return ResponseEntity.ok(service.list(userId));
    }

    /** Admin queue: all requests, optional status filter. */
    @GetMapping("/admin/requests")
    public ResponseEntity<Page<PrivacyRequest>> adminList(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "privacy", null, "admin-list");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        Pageable pg = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<PrivacyRequest> result = (status != null)
                ? new PageImpl<>(repo.findByStatus(status.toUpperCase()), pg,
                    repo.findByStatus(status.toUpperCase()).size())
                : repo.findAll(pg);
        return ResponseEntity.ok(result);
    }

    /** SLA breach queue. */
    @GetMapping("/admin/sla-breached")
    public ResponseEntity<List<PrivacyRequest>> slaBreached(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.findSlaBreached(Instant.now()));
    }

    @PostMapping("/requests/{id}/verify")
    public ResponseEntity<PrivacyRequest> verify(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody VerifyReq r) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "privacy", id.toString(), "verify");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(service.verifyRequest(id, r.adminUserId(), r.notes()));
    }

    @PostMapping("/requests/{id}/fulfill")
    public ResponseEntity<PrivacyRequest> fulfill(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody FulfillReq r) {
        // Fine-grained check replaces the plain admin gate.
        // Uses the permissions evaluator; the seeded "ROLE admin → * *" grant keeps existing admins working.
        var decision = perms.checkAndAudit(callerTenantId, callerId, role,
                                           "privacy", id.toString(), "fulfill");
        if (!decision.allowed()) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, decision.reason());
        }
        return ResponseEntity.ok(service.fulfill(id, r.adminUserId()));
    }

    @PostMapping("/admin/retention/run-now")
    public ResponseEntity<Map<String, Object>> runHardDeletes(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        int n = service.processOverdueHardDeletes();
        return ResponseEntity.ok(Map.of("processed", n));
    }

    @GetMapping("/requests/{id}/export")
    public ResponseEntity<byte[]> download(@PathVariable UUID id) throws java.io.IOException {
        byte[] data = service.readExport(id);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=privacy-export-" + id + ".json")
                .contentType(MediaType.APPLICATION_JSON)
                .body(data);
    }
}
