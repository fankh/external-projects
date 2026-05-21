package com.kyra.sso.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kyra.sso.model.SsoConfiguration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class OidcService {

    private final WebClient.Builder webClientBuilder;
    private final ObjectMapper objectMapper;

    @Value("${sso.oidc.redirect-uri-template:http://localhost:8030/v1/sso/oidc/{tenantId}/callback}")
    private String redirectUriTemplate;

    /**
     * Build the OIDC authorization URL that the user should be redirected to.
     */
    public String buildAuthorizationUrl(SsoConfiguration config) {
        String redirectUri = redirectUriTemplate.replace("{tenantId}", config.getTenantId().toString());
        String state = UUID.randomUUID().toString();
        String nonce = UUID.randomUUID().toString();

        String[] scopes = config.getScopes() != null && config.getScopes().length > 0
                ? config.getScopes()
                : new String[]{"openid", "profile", "email"};

        String scopeStr = String.join(" ", scopes);

        StringBuilder url = new StringBuilder(config.getAuthorizationUrl());
        url.append("?response_type=code");
        url.append("&client_id=").append(URLEncoder.encode(config.getClientId(), StandardCharsets.UTF_8));
        url.append("&redirect_uri=").append(URLEncoder.encode(redirectUri, StandardCharsets.UTF_8));
        url.append("&scope=").append(URLEncoder.encode(scopeStr, StandardCharsets.UTF_8));
        url.append("&state=").append(URLEncoder.encode(state, StandardCharsets.UTF_8));
        url.append("&nonce=").append(URLEncoder.encode(nonce, StandardCharsets.UTF_8));

        return url.toString();
    }

    /**
     * Exchange the authorization code for tokens and extract user info.
     */
    public Map<String, Object> handleCallback(SsoConfiguration config, String code) {
        String redirectUri = redirectUriTemplate.replace("{tenantId}", config.getTenantId().toString());

        // Exchange code for tokens
        Map<String, Object> tokenResponse = exchangeCodeForTokens(config, code, redirectUri);

        String idToken = (String) tokenResponse.get("id_token");
        String accessToken = (String) tokenResponse.get("access_token");

        Map<String, Object> attributes = new HashMap<>();

        // Parse ID token claims
        if (idToken != null) {
            Map<String, Object> claims = parseIdToken(idToken);
            attributes.putAll(mapClaims(claims, config.getAttributeMapping()));
            attributes.put("subjectId", claims.getOrDefault("sub", ""));
        }

        // Fetch userinfo if endpoint is configured and we have an access token
        if (config.getUserinfoUrl() != null && !config.getUserinfoUrl().isBlank() && accessToken != null) {
            Map<String, Object> userInfo = fetchUserInfo(config.getUserinfoUrl(), accessToken);
            // Userinfo supplements but doesn't override ID token claims
            for (Map.Entry<String, Object> entry : mapClaims(userInfo, config.getAttributeMapping()).entrySet()) {
                attributes.putIfAbsent(entry.getKey(), entry.getValue());
            }
        }

        attributes.put("provider", "oidc");
        attributes.put("tenantId", config.getTenantId().toString());

        log.info("OIDC authentication successful for: {}", attributes.get("email"));
        return attributes;
    }

    private Map<String, Object> exchangeCodeForTokens(SsoConfiguration config, String code, String redirectUri) {
        WebClient webClient = webClientBuilder.build();

        MultiValueMap<String, String> formData = new LinkedMultiValueMap<>();
        formData.add("grant_type", "authorization_code");
        formData.add("code", code);
        formData.add("redirect_uri", redirectUri);
        formData.add("client_id", config.getClientId());
        formData.add("client_secret", config.getClientSecret());

        String responseBody = webClient.post()
                .uri(config.getTokenUrl())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(BodyInserters.fromFormData(formData))
                .retrieve()
                .bodyToMono(String.class)
                .block();

        try {
            JsonNode json = objectMapper.readTree(responseBody);
            Map<String, Object> result = new HashMap<>();
            if (json.has("id_token")) result.put("id_token", json.get("id_token").asText());
            if (json.has("access_token")) result.put("access_token", json.get("access_token").asText());
            if (json.has("refresh_token")) result.put("refresh_token", json.get("refresh_token").asText());
            if (json.has("expires_in")) result.put("expires_in", json.get("expires_in").asInt());
            return result;
        } catch (Exception e) {
            log.error("Failed to parse token response", e);
            throw new RuntimeException("Token exchange failed: " + e.getMessage(), e);
        }
    }

    /**
     * Parse the JWT ID token payload (without signature verification for simplicity).
     * In production, signature verification against the IdP's JWKS should be performed.
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> parseIdToken(String idToken) {
        try {
            String[] parts = idToken.split("\\.");
            if (parts.length < 2) {
                throw new IllegalArgumentException("Invalid JWT format");
            }
            byte[] payload = Base64.getUrlDecoder().decode(parts[1]);
            return objectMapper.readValue(payload, Map.class);
        } catch (Exception e) {
            log.error("Failed to parse ID token", e);
            return Map.of();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fetchUserInfo(String userinfoUrl, String accessToken) {
        try {
            WebClient webClient = webClientBuilder.build();
            String responseBody = webClient.get()
                    .uri(userinfoUrl)
                    .header("Authorization", "Bearer " + accessToken)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            return objectMapper.readValue(responseBody, Map.class);
        } catch (Exception e) {
            log.error("Failed to fetch userinfo", e);
            return Map.of();
        }
    }

    private Map<String, Object> mapClaims(Map<String, Object> claims, Map<String, String> attributeMapping) {
        Map<String, Object> mapped = new HashMap<>();
        if (attributeMapping == null || attributeMapping.isEmpty()) {
            // Default mappings
            if (claims.containsKey("email")) mapped.put("email", claims.get("email"));
            if (claims.containsKey("name")) mapped.put("name", claims.get("name"));
            if (claims.containsKey("groups")) mapped.put("groups", claims.get("groups"));
            return mapped;
        }

        for (Map.Entry<String, String> entry : attributeMapping.entrySet()) {
            String targetField = entry.getKey();
            String sourceField = entry.getValue();
            if (claims.containsKey(sourceField)) {
                mapped.put(targetField, claims.get(sourceField));
            }
        }
        return mapped;
    }
}
