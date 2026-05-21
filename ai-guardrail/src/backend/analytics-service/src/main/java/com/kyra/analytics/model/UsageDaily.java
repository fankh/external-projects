package com.kyra.analytics.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "usage_daily")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageDaily {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "department_id")
    private UUID departmentId;

    @Column(name = "persona_id")
    private UUID personaId;

    @Column(name = "purpose_id")
    private UUID purposeId;

    @Builder.Default
    @Column(name = "query_count", nullable = false)
    private Integer queryCount = 0;

    @Builder.Default
    @Column(name = "token_count", nullable = false)
    private Long tokenCount = 0L;

    @Builder.Default
    @Column(name = "prompt_tokens", nullable = false)
    private Long promptTokens = 0L;

    @Builder.Default
    @Column(name = "completion_tokens", nullable = false)
    private Long completionTokens = 0L;

    @Builder.Default
    @Column(name = "estimated_cost", precision = 10, scale = 4)
    private BigDecimal estimatedCost = BigDecimal.ZERO;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
