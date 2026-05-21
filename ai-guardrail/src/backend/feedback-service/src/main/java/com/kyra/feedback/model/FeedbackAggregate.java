package com.kyra.feedback.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "feedback_aggregates")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FeedbackAggregate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "persona_id")
    private UUID personaId;

    @Column(name = "model_id")
    private String modelId;

    @Column(name = "positive_count", nullable = false)
    @Builder.Default
    private Long positiveCount = 0L;

    @Column(name = "negative_count", nullable = false)
    @Builder.Default
    private Long negativeCount = 0L;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "reason_counts", columnDefinition = "jsonb")
    private Map<String, Integer> reasonCounts;
}
