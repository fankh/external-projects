package com.kyra.security.scheduler;

import com.kyra.security.client.TenantServiceClient;
import com.kyra.security.repository.AuditLogRepository;
import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class AuditRetentionScheduler {

    private final TenantServiceClient tenantClient;
    private final AuditLogRepository auditLogRepository;
    private final AuditService auditService;

    @Value("${audit.retention.default-days:2555}") // 7 years
    private int defaultRetentionDays;

    // Daily 02:00 UTC — can be overridden via env AUDIT_RETENTION_CRON
    @Scheduled(cron = "${audit.retention.cron:0 0 2 * * *}", zone = "UTC")
    public void pruneExpiredAuditLogs() {
        log.info("audit retention sweep starting");
        int totalDeleted = 0;
        int tenantsProcessed = 0;

        List<Map<String, Object>> tenants = tenantClient.listActiveTenants();
        for (Map<String, Object> t : tenants) {
            UUID tenantId = tenantClient.tenantId(t);
            if (tenantId == null) continue;
            int retention = tenantClient.retentionDaysOrDefault(t, defaultRetentionDays);
            Instant cutoff = Instant.now().minus(retention, ChronoUnit.DAYS);
            try {
                int deleted = auditLogRepository.deleteExpiredForTenant(tenantId, cutoff);
                totalDeleted += deleted;
                tenantsProcessed++;
                if (deleted > 0) {
                    auditService.logAuditEvent(tenantId, null, "audit.retention.prune",
                            "audit_logs", null,
                            Map.of("deletedCount", deleted, "cutoffAt", cutoff.toString(), "retentionDays", retention),
                            "SUCCESS", null, null);
                }
            } catch (Exception e) {
                log.error("retention prune failed for tenant {}: {}", tenantId, e.getMessage());
            }
        }
        log.info("audit retention sweep done: tenants={}, deleted={}", tenantsProcessed, totalDeleted);
    }
}
