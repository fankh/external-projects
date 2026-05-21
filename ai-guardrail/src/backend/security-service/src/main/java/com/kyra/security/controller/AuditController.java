package com.kyra.security.controller;

import com.kyra.security.dto.SecurityEventDTO;
import com.kyra.security.model.AuditLog;
import com.kyra.security.model.SecurityEvent;
import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/audit")
@RequiredArgsConstructor
@Slf4j
public class AuditController {

    private final AuditService auditService;
    private final com.kyra.security.permissions.PermissionEvaluator perms;

    @GetMapping("/events")
    public ResponseEntity<Page<SecurityEventDTO>> listSecurityEvents(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID userId,
            @RequestParam(required = false) SecurityEvent.EventType eventType) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<SecurityEventDTO> events;
        if (userId != null) {
            events = auditService.getSecurityEventsByUser(userId, pageable);
        } else if (eventType != null) {
            events = auditService.getSecurityEventsByType(eventType, pageable);
        } else {
            events = auditService.getSecurityEvents(pageable);
        }

        return ResponseEntity.ok(events);
    }

    @GetMapping("/logs")
    public ResponseEntity<Page<AuditLog>> listAuditLogs(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID userId) {

        Pageable pageable = PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt"));

        Page<AuditLog> logs;
        if (userId != null) {
            logs = auditService.getAuditLogsByUser(userId, pageable);
        } else {
            logs = auditService.getAuditLogs(pageable);
        }

        return ResponseEntity.ok(logs);
    }

    @GetMapping("/export")
    public ResponseEntity<?> exportAuditLogs(
            @RequestParam(required = false) String format,
            @RequestParam(required = false) Instant startDate,
            @RequestParam(required = false) Instant endDate) {

        if (startDate == null) {
            startDate = Instant.now().minus(30, ChronoUnit.DAYS);
        }
        if (endDate == null) {
            endDate = Instant.now();
        }

        if ("csv".equalsIgnoreCase(format)) {
            String csv = auditService.exportAuditLogsAsCsv(startDate, endDate);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=audit_logs.csv")
                    .contentType(MediaType.parseMediaType("text/csv"))
                    .body(csv);
        }

        // Default: JSON
        List<AuditLog> logs = auditService.exportAuditLogs(startDate, endDate);
        return ResponseEntity.ok(logs);
    }

    // ---------- V014: Immutability features ----------

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    @GetMapping("/verify")
    public ResponseEntity<java.util.Map<String, Object>> verifyChain(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @RequestParam(required = false) UUID tenantId,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "audit", null, "verify");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        return ResponseEntity.ok(auditService.verifyChain(tenantId, from, to));
    }

    @PostMapping("/{id}/legal-hold")
    public ResponseEntity<java.util.Map<String, Object>> setLegalHold(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "audit", id.toString(), "legal-hold");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        auditService.setLegalHold(id, true);
        return ResponseEntity.ok(java.util.Map.of("id", id, "legalHold", true));
    }

    @DeleteMapping("/{id}/legal-hold")
    public ResponseEntity<java.util.Map<String, Object>> clearLegalHold(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestHeader(value = "X-User-Id", required = false) UUID callerId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @PathVariable UUID id) {
        var d = perms.checkAndAudit(callerTenantId, callerId, role, "audit", id.toString(), "legal-hold");
        if (!d.allowed()) throw new org.springframework.web.server.ResponseStatusException(
            org.springframework.http.HttpStatus.FORBIDDEN, d.reason());
        auditService.setLegalHold(id, false);
        return ResponseEntity.ok(java.util.Map.of("id", id, "legalHold", false));
    }
}
