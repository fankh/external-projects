package com.kyra.agent.dto;

import com.kyra.agent.model.AgentApproval;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApprovalDTO {

    private UUID id;
    private UUID executionId;
    private UUID stepId;
    private String actionDescription;
    private String riskLevel;
    private String status;
    private UUID reviewedBy;
    private String reviewNote;
    private Instant createdAt;
    private Instant reviewedAt;

    public static ApprovalDTO fromEntity(AgentApproval entity) {
        return ApprovalDTO.builder()
                .id(entity.getId())
                .executionId(entity.getExecution().getId())
                .stepId(entity.getStep() != null ? entity.getStep().getId() : null)
                .actionDescription(entity.getActionDescription())
                .riskLevel(entity.getRiskLevel())
                .status(entity.getStatus().name())
                .reviewedBy(entity.getReviewedBy())
                .reviewNote(entity.getReviewNote())
                .createdAt(entity.getCreatedAt())
                .reviewedAt(entity.getReviewedAt())
                .build();
    }
}
