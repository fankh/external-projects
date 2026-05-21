package com.kyra.chat.client;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.util.List;

@Component
@Slf4j
public class SecurityServiceClient {

    private final WebClient webClient;

    public SecurityServiceClient(@Value("${services.security.url}") String securityServiceUrl, WebClient.Builder builder) {
        this.webClient = builder.baseUrl(securityServiceUrl).build();
    }

    public Mono<ScanResponse> scan(ScanRequest request) {
        return webClient.post()
                .uri("/v1/security/scan")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToMono(ScanResponse.class)
                .doOnError(e -> log.error("Security service scan failed: {}", e.getMessage()))
                .onErrorReturn(ScanResponse.builder().safe(true).findings(List.of()).build());
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ScanRequest {
        private String content;
        private String direction; // "input" or "output"
        private String userId;
        private String personaId;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ScanResponse {
        private boolean safe;
        private List<Finding> findings;
        private String sanitizedContent;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Finding {
        private String type;
        private String severity;
        private String description;
        private String field;
    }
}
