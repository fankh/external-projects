package com.kyra.security.uba;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "user_anomalies")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserAnomaly {

    public enum Type { NEW_IP, NEW_DEVICE, OFF_HOURS, VOLUME_SPIKE, IMPOSSIBLE_TRAVEL }
    public enum Severity { LOW, MEDIUM, HIGH, CRITICAL }

    @Id
    private UUID id;

    @Column(name = "tenant_id") private UUID tenantId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "anomaly_type", nullable = false) private String anomalyType;
    @Column(nullable = false) private String severity;
    @Column(name = "risk_delta", nullable = false) private Integer riskDelta;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> details;

    @Column(name = "detected_at", nullable = false) @Builder.Default
    private Instant detectedAt = Instant.now();

    @Column(nullable = false) @Builder.Default
    private Boolean acknowledged = Boolean.FALSE;

    @Column(name = "acknowledged_by") private UUID acknowledgedBy;
    @Column(name = "acknowledged_at") private Instant acknowledgedAt;
}
