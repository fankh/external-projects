package com.kyra.security.breach;

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
@RequestMapping("/v1/breach")
@RequiredArgsConstructor
public class BreachController {

    private final BreachService service;
    private final BreachIncidentRepository repo;
    private final com.kyra.security.permissions.PermissionEvaluator perms;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
    }

    public record ReportReq(UUID tenantId, UUID reportedBy,
                            BreachIncident.Severity severity, BreachIncident.Category category,
                            Integer affectedCount, List<String> dataCategories,
                            String description, String rootCause, String containment,
                            Boolean highRisk, Map<String, Object> metadata) {}

    @PostMapping("/incidents")
    public ResponseEntity<BreachIncident> report(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody ReportReq r) {
        requireAdmin(role);
        if (r.severity() == null || r.category() == null || r.description() == null) {
            throw new IllegalArgumentException("severity, category, and description are required");
        }
        return ResponseEntity.ok(service.report(
                r.tenantId(), r.reportedBy(), r.severity(), r.category(),
                r.affectedCount() == null ? 0 : r.affectedCount(),
                r.dataCategories(), r.description(), r.rootCause(), r.containment(),
                Boolean.TRUE.equals(r.highRisk()), r.metadata()));
    }

    @GetMapping("/incidents")
    public ResponseEntity<Page<BreachIncident>> list(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.findAll(PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "detectedAt"))));
    }

    @GetMapping("/incidents/{id}")
    public ResponseEntity<BreachIncident> get(@PathVariable UUID id) {
        return repo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/overdue")
    public ResponseEntity<List<BreachIncident>> overdue(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(service.authorityOverdue());
    }

    public record NotifyAuthReq(String referenceNumber, UUID actor) {}
    @PostMapping("/incidents/{id}/notify-authority")
    public ResponseEntity<BreachIncident> notifyAuth(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody NotifyAuthReq r) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "breach", id.toString(), "notify-authority");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(service.notifyAuthority(id, r.referenceNumber(), r.actor()));
    }

    public record NotifySubjReq(Integer count, UUID actor) {}
    @PostMapping("/incidents/{id}/notify-subjects")
    public ResponseEntity<BreachIncident> notifySubj(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody NotifySubjReq r) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "breach", id.toString(), "notify-subjects");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(service.notifySubjects(id, r.count() == null ? 0 : r.count(), r.actor()));
    }

    public record StatusReq(BreachIncident.Status status, UUID actor) {}
    @PostMapping("/incidents/{id}/status")
    public ResponseEntity<BreachIncident> setStatus(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id, @RequestBody StatusReq r) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "breach", id.toString(), "status");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(service.updateStatus(id, r.status(), r.actor()));
    }
}
