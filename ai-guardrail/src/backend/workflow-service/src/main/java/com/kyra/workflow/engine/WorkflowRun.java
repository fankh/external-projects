package com.kyra.workflow.engine;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity @Table(name = "workflow_runs")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class WorkflowRun {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "workflow_id", nullable = false) private UUID workflowId;
    @Column(name = "tenant_id") private UUID tenantId;
    @Column(nullable = false) @Builder.Default private String status = "PENDING";
    @Column(name = "current_step_id") private String currentStepId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> input;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> output;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "step_results", columnDefinition = "jsonb") @Builder.Default private List<Map<String, Object>> stepResults = new java.util.ArrayList<>();
    @Column(name = "started_at") private Instant startedAt;
    @Column(name = "completed_at") private Instant completedAt;
    private String error;
    @Column(name = "created_at") @Builder.Default private Instant createdAt = Instant.now();
}
