package com.kyra.security.uba;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "user_behavior_profiles")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class UserBehaviorProfile {

    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "tenant_id") private UUID tenantId;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "hour_histogram", columnDefinition = "integer[]")
    private List<Integer> hourHistogram;

    @Column(name = "total_observations", nullable = false) @Builder.Default
    private Integer totalObservations = 0;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "known_ip_hashes", columnDefinition = "text[]")
    private List<String> knownIpHashes;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "known_ua_hashes", columnDefinition = "text[]")
    private List<String> knownUaHashes;

    @Column(name = "last_observed_at") private Instant lastObservedAt;

    @Column(name = "avg_logins_per_day", nullable = false) @Builder.Default
    private Double avgLoginsPerDay = 0.0;

    @Column(name = "stddev_logins", nullable = false) @Builder.Default
    private Double stddevLogins = 0.0;

    @Column(name = "risk_score", nullable = false) @Builder.Default
    private Integer riskScore = 0;

    @Column(name = "created_at", nullable = false) @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false) @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate protected void onUpdate() { this.updatedAt = Instant.now(); }
}
