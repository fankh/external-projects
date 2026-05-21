package com.kyra.workflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkflowResultDTO {

    private UUID executionId;
    private String status;
    private String formattedOutput;
    private String outputFormat;
    private Map<String, Object> rawOutput;
    private List<Map<String, Object>> stepResults;
    private Integer durationMs;
}
