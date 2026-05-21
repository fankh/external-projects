package com.kyra.integration.dto;

import com.kyra.integration.model.Integration;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class IntegrationDTO {

    private UUID id;
    private UUID tenantId;
    private Integration.IntegrationType type;
    private String name;
    private Integration.IntegrationStatus status;
    private Map<String, Object> config;
    private Instant lastSyncAt;
    private String errorMessage;
    private Instant createdAt;
    private Instant updatedAt;

    public static IntegrationDTO fromEntity(Integration entity) {
        return IntegrationDTO.builder()
                .id(entity.getId())
                .tenantId(entity.getTenantId())
                .type(entity.getType())
                .name(entity.getName())
                .status(entity.getStatus())
                .config(entity.getConfig())
                .lastSyncAt(entity.getLastSyncAt())
                .errorMessage(entity.getErrorMessage())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
