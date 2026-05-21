package com.kyra.agent.dto;

import com.kyra.agent.model.ExecutionStep;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExecutionStepDTO {

    private UUID id;
    private Integer stepNumber;
    private String toolName;
    private Map<String, Object> toolInput;
    private Map<String, Object> toolOutput;
    private String status;
    private String errorMessage;
    private Integer durationMs;
    private Instant createdAt;

    public static ExecutionStepDTO fromEntity(ExecutionStep entity) {
        return ExecutionStepDTO.builder()
                .id(entity.getId())
                .stepNumber(entity.getStepNumber())
                .toolName(entity.getToolName())
                .toolInput(entity.getToolInput())
                .toolOutput(entity.getToolOutput())
                .status(entity.getStatus().name())
                .errorMessage(entity.getErrorMessage())
                .durationMs(entity.getDurationMs())
                .createdAt(entity.getCreatedAt())
                .build();
    }
}
