package com.kyra.sso.controller;

import com.kyra.sso.dto.*;
import com.kyra.sso.model.SsoConfiguration;
import com.kyra.sso.repository.SsoConfigurationRepository;
import com.kyra.sso.service.LdapService;
import com.kyra.sso.service.OidcService;
import com.kyra.sso.service.SamlService;
import com.kyra.sso.service.SsoUserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/sso")
@RequiredArgsConstructor
public class SsoController {

    private final SsoConfigurationRepository configRepository;
    private final SamlService samlService;
    private final OidcService oidcService;
    private final LdapService ldapService;
    private final SsoUserService ssoUserService;

    // ---- Configuration Endpoints ----

    @GetMapping("/{tenantId}/providers")
    public ResponseEntity<List<SsoConfigDTO>> listProviders(@PathVariable UUID tenantId) {
        List<SsoConfiguration> configs = configRepository.findByTenantIdAndIsActive(tenantId, true);
        List<SsoConfigDTO> dtos = configs.stream().map(this::toDTO).toList();
        return ResponseEntity.ok(dtos);
    }

    @PostMapping("/config")
    public ResponseEntity<SsoConfigDTO> createConfig(@Valid @RequestBody CreateSsoConfigRequest request) {
        SsoConfiguration config = SsoConfiguration.builder()
                .tenantId(request.getTenantId())
                .providerType(request.getProviderType())
                .name(request.getName())
                .config(request.getConfig() != null ? request.getConfig() : Map.of())
                .metadataUrl(request.getMetadataUrl())
                .entityId(request.getEntityId())
                .certificate(request.getCertificate())
                .clientId(request.getClientId())
                .clientSecret(request.getClientSecret())
                .authorizationUrl(request.getAuthorizationUrl())
                .tokenUrl(request.getTokenUrl())
                .userinfoUrl(request.getUserinfoUrl())
                .scopes(request.getScopes() != null ? request.getScopes() : new String[]{"openid", "profile", "email"})
                .attributeMapping(request.getAttributeMapping() != null
                        ? request.getAttributeMapping()
                        : Map.of("email", "email", "name", "name", "groups", "groups"))
                .build();

        config = configRepository.save(config);
        return ResponseEntity.status(HttpStatus.CREATED).body(toDTO(config));
    }

    @PutMapping("/config/{id}")
    public ResponseEntity<SsoConfigDTO> updateConfig(@PathVariable UUID id,
                                                      @Valid @RequestBody CreateSsoConfigRequest request) {
        SsoConfiguration config = configRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("SSO configuration not found: " + id));

        config.setName(request.getName());
        if (request.getConfig() != null) config.setConfig(request.getConfig());
        config.setMetadataUrl(request.getMetadataUrl());
        config.setEntityId(request.getEntityId());
        if (request.getCertificate() != null) config.setCertificate(request.getCertificate());
        config.setClientId(request.getClientId());
        if (request.getClientSecret() != null) config.setClientSecret(request.getClientSecret());
        config.setAuthorizationUrl(request.getAuthorizationUrl());
        config.setTokenUrl(request.getTokenUrl());
        config.setUserinfoUrl(request.getUserinfoUrl());
        if (request.getScopes() != null) config.setScopes(request.getScopes());
        if (request.getAttributeMapping() != null) config.setAttributeMapping(request.getAttributeMapping());

        config = configRepository.save(config);
        return ResponseEntity.ok(toDTO(config));
    }

    @DeleteMapping("/config/{id}")
    public ResponseEntity<java.util.Map<String, Object>> deleteConfig(@PathVariable UUID id) {
        if (!configRepository.existsById(id)) {
            throw new NoSuchElementException("SSO configuration not found: " + id);
        }
        configRepository.deleteById(id);
        return ResponseEntity.ok(java.util.Map.of("deleted", id.toString()));
    }

    @PostMapping("/config/{id}/activate")
    public ResponseEntity<SsoConfigDTO> activate(@PathVariable UUID id) {
        SsoConfiguration config = configRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("SSO configuration not found: " + id));
        config.setActive(true);
        return ResponseEntity.ok(toDTO(configRepository.save(config)));
    }

    @PostMapping("/config/{id}/deactivate")
    public ResponseEntity<SsoConfigDTO> deactivate(@PathVariable UUID id) {
        SsoConfiguration config = configRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("SSO configuration not found: " + id));
        config.setActive(false);
        return ResponseEntity.ok(toDTO(configRepository.save(config)));
    }

    // ---- SAML Endpoints ----

    @GetMapping("/saml/{tenantId}/login")
    public ResponseEntity<SsoLoginResponse> samlLogin(@PathVariable UUID tenantId) {
        SsoConfiguration config = configRepository.findByTenantIdAndProviderType(tenantId, "saml")
                .orElseThrow(() -> new NoSuchElementException("No SAML configuration for tenant: " + tenantId));

        String redirectUrl = samlService.generateLoginUrl(config);
        return ResponseEntity.ok(SsoLoginResponse.builder()
                .redirectUrl(redirectUrl)
                .provider("saml")
                .build());
    }

    @PostMapping("/saml/{tenantId}/callback")
    public ResponseEntity<SsoLoginResponse> samlCallback(@PathVariable UUID tenantId,
                                                          @RequestBody SamlResponseDTO samlResponse) {
        SsoConfiguration config = configRepository.findByTenantIdAndProviderType(tenantId, "saml")
                .orElseThrow(() -> new NoSuchElementException("No SAML configuration for tenant: " + tenantId));

        Map<String, Object> attributes = samlService.parseSamlResponse(samlResponse.getSamlResponse(), config);
        SsoLoginResponse response = ssoUserService.findOrCreateUser(attributes);
        return ResponseEntity.ok(response);
    }

    // ---- OIDC Endpoints ----

    @GetMapping("/oidc/{tenantId}/login")
    public ResponseEntity<SsoLoginResponse> oidcLogin(@PathVariable UUID tenantId) {
        SsoConfiguration config = configRepository.findByTenantIdAndProviderType(tenantId, "oidc")
                .orElseThrow(() -> new NoSuchElementException("No OIDC configuration for tenant: " + tenantId));

        String redirectUrl = oidcService.buildAuthorizationUrl(config);
        return ResponseEntity.ok(SsoLoginResponse.builder()
                .redirectUrl(redirectUrl)
                .provider("oidc")
                .build());
    }

    @GetMapping("/oidc/{tenantId}/callback")
    public ResponseEntity<SsoLoginResponse> oidcCallback(@PathVariable UUID tenantId,
                                                          @RequestParam String code,
                                                          @RequestParam(required = false) String state) {
        SsoConfiguration config = configRepository.findByTenantIdAndProviderType(tenantId, "oidc")
                .orElseThrow(() -> new NoSuchElementException("No OIDC configuration for tenant: " + tenantId));

        Map<String, Object> attributes = oidcService.handleCallback(config, code);
        SsoLoginResponse response = ssoUserService.findOrCreateUser(attributes);
        return ResponseEntity.ok(response);
    }

    // ---- LDAP Endpoint ----

    @PostMapping("/ldap/{tenantId}/authenticate")
    public ResponseEntity<SsoLoginResponse> ldapAuthenticate(
            @PathVariable UUID tenantId,
            @RequestBody Map<String, String> credentials) {
        SsoConfiguration config = configRepository.findByTenantIdAndProviderType(tenantId, "ldap")
                .orElseThrow(() -> new NoSuchElementException("No LDAP configuration for tenant: " + tenantId));

        String username = credentials.get("username");
        String password = credentials.get("password");

        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(SsoLoginResponse.builder()
                    .authenticated(false)
                    .error("Username and password are required")
                    .build());
        }

        Map<String, Object> attributes = ldapService.authenticate(config, username, password);
        SsoLoginResponse response = ssoUserService.findOrCreateUser(attributes);
        return ResponseEntity.ok(response);
    }

    // ---- Mapping ----

    private SsoConfigDTO toDTO(SsoConfiguration c) {
        return SsoConfigDTO.builder()
                .id(c.getId())
                .tenantId(c.getTenantId())
                .providerType(c.getProviderType())
                .name(c.getName())
                .isActive(c.isActive())
                .config(c.getConfig())
                .metadataUrl(c.getMetadataUrl())
                .entityId(c.getEntityId())
                .clientId(c.getClientId())
                .authorizationUrl(c.getAuthorizationUrl())
                .tokenUrl(c.getTokenUrl())
                .userinfoUrl(c.getUserinfoUrl())
                .scopes(c.getScopes())
                .attributeMapping(c.getAttributeMapping())
                .createdAt(c.getCreatedAt())
                .updatedAt(c.getUpdatedAt())
                .build();
    }
}
