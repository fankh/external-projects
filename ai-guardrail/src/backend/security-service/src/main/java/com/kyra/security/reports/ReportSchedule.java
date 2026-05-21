package com.kyra.security.reports;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "report_schedules")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ReportSchedule {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "tenant_id") private UUID tenantId;
    @Column(nullable = false) private String name;
    @Column(name = "report_type", nullable = false) private String reportType;
    @Column(name = "cron_expr", nullable = false) @Builder.Default private String cronExpr = "0 6 * * 1";
    @Column(nullable = false) @Builder.Default private String format = "json";
    @Column(nullable = false) @Builder.Default private Boolean enabled = true;
    @Column(name = "last_run_at") private Instant lastRunAt;
    @Column(name = "next_run_at") private Instant nextRunAt;
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
}
