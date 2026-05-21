package com.kyra.agent.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "agent_approvals")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AgentApproval {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "execution_id", nullable = false)
    private AgentExecution execution;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "step_id")
    private ExecutionStep step;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String actionDescription;

    @Column(nullable = false, length = 20)
    @Builder.Default
    private String riskLevel = "medium";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "approval_status")
    @Builder.Default
    private ApprovalStatus status = ApprovalStatus.pending;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(columnDefinition = "TEXT")
    private String reviewNote;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    private Instant reviewedAt;

    public enum ApprovalStatus {
        pending, approved, rejected
    }
}
