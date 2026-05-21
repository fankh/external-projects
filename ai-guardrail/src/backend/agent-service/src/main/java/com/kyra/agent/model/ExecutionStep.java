package com.kyra.agent.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "execution_steps")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExecutionStep {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "execution_id", nullable = false)
    private AgentExecution execution;

    @Column(nullable = false)
    private Integer stepNumber;

    @Column(nullable = false, length = 100)
    private String toolName;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> toolInput = Map.of();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> toolOutput;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "execution_status")
    @Builder.Default
    private AgentExecution.ExecutionStatus status = AgentExecution.ExecutionStatus.pending;

    @Column(columnDefinition = "TEXT")
    private String errorMessage;

    private Integer durationMs;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
