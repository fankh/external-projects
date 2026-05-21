package com.kyra.memory.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class MLMemoryClient {

    private final WebClient webClient;

    public MLMemoryClient(@Value("${memory.ml-service.base-url}") String baseUrl) {
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    /**
     * Call ML service to extract memories from conversation messages.
     * Returns a list of extracted memory maps with keys: type, key, value, importance, confidence.
     */
    public List<Map<String, Object>> extractMemories(List<Map<String, Object>> messages) {
        log.debug("Calling ML service to extract memories from {} messages", messages.size());
        try {
            Map<String, Object> response = webClient.post()
                    .uri("/v1/memory/extract")
                    .bodyValue(Map.of("messages", messages))
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();

            if (response != null && response.containsKey("memories")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> memories = (List<Map<String, Object>>) response.get("memories");
                log.info("ML service extracted {} memories", memories.size());
                return memories;
            }
            return List.of();
        } catch (Exception e) {
            log.error("Failed to call ML memory extraction service: {}", e.getMessage());
            return List.of();
        }
    }

    /**
     * Call ML service to consolidate a list of memories.
     * Returns consolidation result with merged, archived, and unchanged lists.
     */
    public Map<String, Object> consolidateMemories(List<Map<String, Object>> memories) {
        log.debug("Calling ML service to consolidate {} memories", memories.size());
        try {
            Map<String, Object> response = webClient.post()
                    .uri("/v1/memory/consolidate")
                    .bodyValue(Map.of("memories", memories))
                    .retrieve()
                    .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();

            if (response != null) {
                return response;
            }
            return Map.of("merged", List.of(), "archived", List.of(), "unchanged", memories);
        } catch (Exception e) {
            log.error("Failed to call ML memory consolidation service: {}", e.getMessage());
            return Map.of("merged", List.of(), "archived", List.of(), "unchanged", memories);
        }
    }
}
