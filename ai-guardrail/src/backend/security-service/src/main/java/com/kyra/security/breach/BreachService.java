package com.kyra.security.breach;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class BreachService {

    private static final int AUTHORITY_DEADLINE_HOURS = 72;   // Art.33(1)

    private final BreachIncidentRepository repo;
    private final AuditService auditService;
    private final com.kyra.security.metrics.ComplianceMetrics metrics;

    @Transactional
    public BreachIncident report(UUID tenantId, UUID reportedBy,
                                 BreachIncident.Severity severity, BreachIncident.Category category,
                                 int affectedCount, List<String> dataCategories,
                                 String description, String rootCause, String containment,
                                 boolean highRisk, Map<String, Object> metadata) {
        Instant detected = Instant.now();
        BreachIncident b = BreachIncident.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .detectedAt(detected)
                .reportedBy(reportedBy)
                .severity(severity.name())
                .category(category.name())
                .affectedRecordCount(affectedCount)
                .affectedDataCategories(dataCategories == null ? Collections.emptyList() : dataCategories)
                .description(description)
                .rootCause(rootCause)
                .containmentActions(containment)
                .highRiskToSubjects(highRisk)
                .authorityDeadlineAt(detected.plus(AUTHORITY_DEADLINE_HOURS, ChronoUnit.HOURS))
                .status(BreachIncident.Status.OPEN.name())
                .metadata(metadata)
                .build();
        b = repo.save(b);
        metrics.breachReported(severity.name(), category.name());
        auditService.logAuditEvent(tenantId, reportedBy, "breach.reported",
                "breach_incident", b.getId().toString(),
                Map.of("severity", severity.name(), "category", category.name(),
                       "affectedRecordCount", affectedCount, "highRisk", highRisk),
                "SUCCESS", null, null);
        return b;
    }

    @Transactional
    public BreachIncident notifyAuthority(UUID id, String referenceNumber, UUID actor) {
        BreachIncident b = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("Breach not found"));
        if (b.getAuthorityNotifiedAt() != null) {
            throw new IllegalStateException("Authority already notified at " + b.getAuthorityNotifiedAt());
        }
        b.setAuthorityNotifiedAt(Instant.now());
        b.setAuthorityNotificationRef(referenceNumber);
        b.setStatus(BreachIncident.Status.NOTIFIED.name());
        repo.save(b);
        auditService.logAuditEvent(b.getTenantId(), actor, "breach.authority_notified",
                "breach_incident", b.getId().toString(),
                Map.of("ref", referenceNumber == null ? "" : referenceNumber),
                "SUCCESS", null, null);
        metrics.breachAuthorityNotified(!b.getAuthorityDeadlineAt().isBefore(b.getAuthorityNotifiedAt()));
        // Detect overdue status for telemetry
        if (b.getAuthorityDeadlineAt().isBefore(b.getAuthorityNotifiedAt())) {
            log.warn("breach {} notified after 72h deadline (overdue)", b.getId());
        }
        return b;
    }

    @Transactional
    public BreachIncident notifySubjects(UUID id, int count, UUID actor) {
        BreachIncident b = repo.findById(id).orElseThrow(() -> new IllegalArgumentException("Breach not found"));
        if (!Boolean.TRUE.equals(b.getHighRiskToSubjects())) {
            throw new IllegalStateException("Breach is not high-risk; subject notification not required");
        }
        b.setSubjectsNotifiedAt(Instant.now());
        b.setSubjectsNotificationCount(count);
        repo.save(b);
        auditService.logAuditEvent(b.getTenantId(), actor, "breach.subjects_notified",
                "breach_incident", b.getId().toString(),
                Map.of("count", count), "SUCCESS", null, null);
        return b;
    }

    @Transactional
    public BreachIncident updateStatus(UUID id, BreachIncident.Status status, UUID actor) {
        BreachIncident b = repo.findById(id).orElseThrow();
        b.setStatus(status.name());
        repo.save(b);
        auditService.logAuditEvent(b.getTenantId(), actor, "breach.status_changed",
                "breach_incident", b.getId().toString(),
                Map.of("status", status.name()), "SUCCESS", null, null);
        return b;
    }

    public List<BreachIncident> authorityOverdue() {
        return repo.findAuthorityOverdue(Instant.now());
    }

    public List<BreachIncident> pendingSubjectNotification() {
        return repo.findPendingSubjectNotification();
    }
}
