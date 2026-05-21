package com.kyra.auth.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.Map;
import java.util.UUID;

@Component
@Slf4j
public class UbaClient {
    private final RestClient rc;

    public UbaClient(@Value("${services.security-service.url:http://security-service:8083}") String url) {
        this.rc = RestClient.builder().baseUrl(url).build();
    }

    @Async
    public void observeLogin(UUID tenantId, UUID userId, String ip, String ua) {
        try {
            rc.post().uri("/v1/uba/observe")
              .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
              .body(Map.of(
                  "tenantId", tenantId == null ? "" : tenantId.toString(),
                  "userId", userId.toString(),
                  "ipAddress", ip == null ? "" : ip,
                  "userAgent", ua == null ? "" : ua))
              .retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.debug("UBA observe failed (non-fatal): {}", e.getMessage());
        }
    }
}
