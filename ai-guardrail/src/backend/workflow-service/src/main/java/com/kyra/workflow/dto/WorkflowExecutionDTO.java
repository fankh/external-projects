package com.kyra.workflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkflowExecutionDTO {

    private UUID id;
    private UUID workflowId;
    private UUID userId;
    private Map<String, Object> input;
    private Map<String, Object> output;
    private String status;
    private int currentStep;
    private List<Map<String, Object>> stepResults;
    private String errorMessage;
    private Instant startedAt;
    private Instant completedAt;
    private Integer durationMs;
    private Instant createdAt;
}
