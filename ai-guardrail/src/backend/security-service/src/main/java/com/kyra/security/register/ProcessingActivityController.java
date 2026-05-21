package com.kyra.security.register;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/processing-register")
@RequiredArgsConstructor
public class ProcessingActivityController {

    private final ProcessingActivityRepository repo;
    private final com.kyra.security.permissions.PermissionEvaluator perms;
    private final AuditService auditService;

    @GetMapping
    public ResponseEntity<List<ProcessingActivity>> list(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "processing-register", null, "read");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(repo.findAll());
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProcessingActivity> get(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "processing-register", id.toString(), "read");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<ProcessingActivity> create(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @RequestBody ProcessingActivity in) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "processing-register", null, "write");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        if (in.getName() == null || in.getPurpose() == null || in.getLegalBasis() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name, purpose, legalBasis are required");
        }
        in.setLastReviewedAt(Instant.now());
        ProcessingActivity saved = repo.save(in);
        auditService.logAuditEvent(callerTenantId, callerId, "processing-register.created",
                "processing_activity", saved.getId().toString(),
                Map.of("name", saved.getName(), "purpose", saved.getPurpose()),
                "SUCCESS", null, null);
        return ResponseEntity.ok(saved);
    }

    @PutMapping("/{id}")
    public ResponseEntity<ProcessingActivity> update(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody ProcessingActivity in) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "processing-register", id.toString(), "write");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        ProcessingActivity existing = repo.findById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND));
        in.setId(id);
        in.setCreatedAt(existing.getCreatedAt());
        in.setLastReviewedAt(Instant.now());
        ProcessingActivity saved = repo.save(in);
        auditService.logAuditEvent(callerTenantId, callerId, "processing-register.updated",
                "processing_activity", id.toString(), Map.of("name", saved.getName()),
                "SUCCESS", null, null);
        return ResponseEntity.ok(saved);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "processing-register", id.toString(), "delete");
        if (!d.allowed()) throw new ResponseStatusException(HttpStatus.FORBIDDEN, d.reason());
        if (!repo.existsById(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        repo.deleteById(id);
        auditService.logAuditEvent(callerTenantId, callerId, "processing-register.deleted",
                "processing_activity", id.toString(), Map.of(),
                "SUCCESS", null, null);
        return ResponseEntity.ok(Map.of("deleted", id.toString()));
    }
}
