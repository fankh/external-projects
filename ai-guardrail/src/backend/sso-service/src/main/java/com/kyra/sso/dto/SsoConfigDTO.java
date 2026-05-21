package com.kyra.sso.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SsoConfigDTO {

    private UUID id;
    private UUID tenantId;
    private String providerType;
    private String name;
    private boolean isActive;
    private Map<String, Object> config;
    private String metadataUrl;
    private String entityId;
    private String clientId;
    private String authorizationUrl;
    private String tokenUrl;
    private String userinfoUrl;
    private String[] scopes;
    private Map<String, String> attributeMapping;
    private Instant createdAt;
    private Instant updatedAt;
}
