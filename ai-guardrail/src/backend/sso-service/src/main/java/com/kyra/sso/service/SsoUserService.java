package com.kyra.sso.service;

import com.kyra.sso.dto.SsoLoginResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@Slf4j
@RequiredArgsConstructor
public class SsoUserService {

    private final WebClient.Builder webClientBuilder;

    @Value("${services.auth.url:http://localhost:8081}")
    private String authServiceUrl;

    /**
     * Find or create a user from the SSO profile, and link the SSO identity.
     */
    @SuppressWarnings("unchecked")
    public SsoLoginResponse findOrCreateUser(Map<String, Object> ssoAttributes) {
        String email = (String) ssoAttributes.get("email");
        String name = (String) ssoAttributes.getOrDefault("name", email);
        String subjectId = (String) ssoAttributes.getOrDefault("subjectId", "");
        String provider = (String) ssoAttributes.getOrDefault("provider", "sso");
        Object groupsObj = ssoAttributes.get("groups");

        List<String> groups = List.of();
        if (groupsObj instanceof List<?> list) {
            groups = list.stream().map(Object::toString).toList();
        } else if (groupsObj instanceof String str) {
            groups = List.of(str.split(","));
        }

        if (email == null || email.isBlank()) {
            return SsoLoginResponse.builder()
                    .authenticated(false)
                    .error("No email address found in SSO response")
                    .build();
        }

        try {
            WebClient authClient = webClientBuilder.baseUrl(authServiceUrl).build();

            // Try to find existing user by SSO identity
            Map<String, Object> linkRequest = new HashMap<>();
            linkRequest.put("email", email);
            linkRequest.put("name", name);
            linkRequest.put("ssoProvider", provider);
            linkRequest.put("ssoSubjectId", subjectId);

            Map<String, Object> userResponse = authClient.post()
                    .uri("/v1/auth/sso/link")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(linkRequest)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .block();

            boolean created = userResponse != null
                    && Boolean.TRUE.equals(userResponse.get("created"));

            log.info("SSO user {} for email: {} (provider: {})",
                    created ? "created" : "linked", email, provider);

            return SsoLoginResponse.builder()
                    .email(email)
                    .name(name)
                    .subjectId(subjectId)
                    .provider(provider)
                    .groups(groups)
                    .attributes(ssoAttributes)
                    .userCreated(created)
                    .authenticated(true)
                    .build();

        } catch (WebClientResponseException e) {
            log.error("Auth service call failed: {} {}", e.getStatusCode(), e.getResponseBodyAsString());
            // Still return successful auth - user sync can happen later
            return SsoLoginResponse.builder()
                    .email(email)
                    .name(name)
                    .subjectId(subjectId)
                    .provider(provider)
                    .groups(groups)
                    .attributes(ssoAttributes)
                    .userCreated(false)
                    .authenticated(true)
                    .build();

        } catch (Exception e) {
            log.error("Failed to find/create SSO user", e);
            return SsoLoginResponse.builder()
                    .email(email)
                    .name(name)
                    .subjectId(subjectId)
                    .provider(provider)
                    .groups(groups)
                    .attributes(ssoAttributes)
                    .userCreated(false)
                    .authenticated(true)
                    .build();
        }
    }
}
