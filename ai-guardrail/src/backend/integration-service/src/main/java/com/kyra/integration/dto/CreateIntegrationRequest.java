package com.kyra.integration.dto;

import com.kyra.integration.model.Integration;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateIntegrationRequest {

    @NotNull(message = "Tenant ID is required")
    private UUID tenantId;

    @NotNull(message = "Integration type is required")
    private Integration.IntegrationType type;

    @NotBlank(message = "Integration name is required")
    private String name;

    private Map<String, Object> config;

    private Map<String, Object> credentials;
}
