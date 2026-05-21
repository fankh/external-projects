package com.kyra.chat.client;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class MLServiceClient {

    private final WebClient webClient;

    public MLServiceClient(@Value("${services.ml.url}") String mlServiceUrl, WebClient.Builder builder) {
        this.webClient = builder.baseUrl(mlServiceUrl).build();
    }

    public Mono<CompletionResponse> complete(CompletionRequest request) {
        return webClient.post()
                .uri("/v1/completions")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToMono(CompletionResponse.class)
                .doOnError(e -> log.error("ML service completion failed: {}", e.getMessage()));
    }

    public Flux<ServerSentEvent<String>> completeStream(CompletionRequest request) {
        return webClient.post()
                .uri("/v1/completions/stream")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToFlux(new ParameterizedTypeReference<ServerSentEvent<String>>() {})
                .doOnError(e -> log.error("ML service stream failed: {}", e.getMessage()));
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CompletionRequest {
        private List<MessageEntry> messages;
        private String model;
        private String personaId;
        private Double temperature;
        private Integer maxTokens;
        private boolean stream;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class MessageEntry {
        private String role;
        private String content;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class CompletionResponse {
        private String content;
        private Integer promptTokens;
        private Integer completionTokens;
        private String modelId;
        private String finishReason;
    }
}
