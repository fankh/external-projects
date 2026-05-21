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
public class RAGServiceClient {

    private final WebClient webClient;

    public RAGServiceClient(@Value("${services.rag.url}") String ragServiceUrl, WebClient.Builder builder) {
        this.webClient = builder.baseUrl(ragServiceUrl).build();
    }

    public Mono<SearchResponse> search(SearchRequest request) {
        return webClient.post()
                .uri("/v1/search")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToMono(SearchResponse.class)
                .doOnError(e -> log.error("RAG service search failed: {}", e.getMessage()))
                .onErrorReturn(SearchResponse.builder().results(List.of()).build());
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SearchRequest {
        private String query;
        private List<String> collectionIds;
        private Integer topK;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SearchResponse {
        private List<SearchResult> results;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SearchResult {
        private String documentId;
        private String content;
        private String title;
        private Double score;
        private Object metadata;
    }
}
