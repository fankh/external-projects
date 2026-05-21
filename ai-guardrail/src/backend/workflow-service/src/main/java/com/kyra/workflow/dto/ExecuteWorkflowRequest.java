package com.kyra.workflow.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExecuteWorkflowRequest {

    @NotNull
    private UUID workflowId;

    @NotNull
    private Map<String, Object> input;
}
