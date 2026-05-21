package com.kyra.security.reports;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "generated_reports")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GeneratedReport {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "schedule_id") private UUID scheduleId;
    @Column(name = "tenant_id") private UUID tenantId;
    @Column(name = "report_type", nullable = false) private String reportType;
    @Column(nullable = false) @Builder.Default private String format = "json";
    @Column(name = "file_path") private String filePath;
    @Column(name = "size_bytes") private Long sizeBytes;
    @Column(name = "generated_at", nullable = false) @Builder.Default private Instant generatedAt = Instant.now();
    @Column(name = "expires_at") private Instant expiresAt;
}
