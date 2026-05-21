package com.kyra.security.breach;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class BreachDeadlineScheduler {

    private final BreachService service;
    private final AuditService auditService;

    /** Hourly check. Flags breaches whose 72-hour authority deadline has passed without notification. */
    @Scheduled(cron = "${breach.deadline.cron:0 0 * * * *}", zone = "UTC")
    public void checkOverdueDeadlines() {
        List<BreachIncident> overdue = service.authorityOverdue();
        if (overdue.isEmpty()) return;
        log.warn("{} breach(es) past 72-hour authority notification deadline", overdue.size());
        for (BreachIncident b : overdue) {
            long hoursLate = ChronoUnit.HOURS.between(b.getAuthorityDeadlineAt(), Instant.now());
            auditService.logAuditEvent(b.getTenantId(), null, "breach.deadline_overdue",
                    "breach_incident", b.getId().toString(),
                    Map.of("hoursLate", hoursLate, "severity", b.getSeverity()),
                    "FAILURE", null, null);
        }
    }

    /** Hourly: warn about high-risk breaches whose subject notification is pending. */
    @Scheduled(cron = "${breach.subjects.cron:0 15 * * * *}", zone = "UTC")
    public void checkPendingSubjectNotifications() {
        List<BreachIncident> pending = service.pendingSubjectNotification();
        if (pending.isEmpty()) return;
        log.warn("{} high-risk breach(es) awaiting subject notification", pending.size());
    }
}
