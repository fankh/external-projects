package com.kyra.agent.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateExecutionRequest {

    @NotNull(message = "agentId is required")
    private UUID agentId;

    @NotBlank(message = "taskDescription is required")
    private String taskDescription;

    private Map<String, Object> parameters;
}
