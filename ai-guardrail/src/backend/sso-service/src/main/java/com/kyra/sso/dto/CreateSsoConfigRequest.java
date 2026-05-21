package com.kyra.sso.dto;

import jakarta.validation.constraints.NotBlank;
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
public class CreateSsoConfigRequest {

    @NotNull
    private UUID tenantId;

    @NotBlank
    private String providerType;

    @NotBlank
    private String name;

    private Map<String, Object> config;

    // SAML fields
    private String metadataUrl;
    private String entityId;
    private String certificate;

    // OIDC fields
    private String clientId;
    private String clientSecret;
    private String authorizationUrl;
    private String tokenUrl;
    private String userinfoUrl;
    private String[] scopes;

    // LDAP fields (stored in config map)

    private Map<String, String> attributeMapping;
}
