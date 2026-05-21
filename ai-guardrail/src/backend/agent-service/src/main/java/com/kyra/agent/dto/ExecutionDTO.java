package com.kyra.agent.dto;

import com.kyra.agent.model.AgentExecution;
import lombok.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExecutionDTO {

    private UUID id;
    private UUID agentId;
    private String agentName;
    private UUID userId;
    private String taskDescription;
    private Map<String, Object> parameters;
    private String status;
    private Integer currentStep;
    private Integer totalSteps;
    private Map<String, Object> plan;
    private Map<String, Object> result;
    private String errorMessage;
    private Instant startedAt;
    private Instant completedAt;
    private Instant createdAt;
    private List<ExecutionStepDTO> steps;
    private List<ApprovalDTO> approvals;

    public static ExecutionDTO fromEntity(AgentExecution entity) {
        return ExecutionDTO.builder()
                .id(entity.getId())
                .agentId(entity.getAgent().getId())
                .agentName(entity.getAgent().getName())
                .userId(entity.getUserId())
                .taskDescription(entity.getTaskDescription())
                .parameters(entity.getParameters())
                .status(entity.getStatus().name())
                .currentStep(entity.getCurrentStep())
                .totalSteps(entity.getTotalSteps())
                .plan(entity.getPlan())
                .result(entity.getResult())
                .errorMessage(entity.getErrorMessage())
                .startedAt(entity.getStartedAt())
                .completedAt(entity.getCompletedAt())
                .createdAt(entity.getCreatedAt())
                .steps(entity.getSteps() != null
                        ? entity.getSteps().stream().map(ExecutionStepDTO::fromEntity).collect(Collectors.toList())
                        : List.of())
                .approvals(entity.getApprovals() != null
                        ? entity.getApprovals().stream().map(ApprovalDTO::fromEntity).collect(Collectors.toList())
                        : List.of())
                .build();
    }

    public static ExecutionDTO fromEntitySummary(AgentExecution entity) {
        return ExecutionDTO.builder()
                .id(entity.getId())
                .agentId(entity.getAgent().getId())
                .agentName(entity.getAgent().getName())
                .userId(entity.getUserId())
                .taskDescription(entity.getTaskDescription())
                .status(entity.getStatus().name())
                .currentStep(entity.getCurrentStep())
                .totalSteps(entity.getTotalSteps())
                .startedAt(entity.getStartedAt())
                .completedAt(entity.getCompletedAt())
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
