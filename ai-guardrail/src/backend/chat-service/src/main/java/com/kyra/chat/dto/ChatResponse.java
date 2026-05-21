package com.kyra.chat.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatResponse {

    private UUID conversationId;
    private UUID messageId;
    private String response;
    private List<Source> sources;
    private TokenUsage tokens;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Source {
        private String documentId;
        private String content;
        private String title;
        private Double score;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class TokenUsage {
        private Integer promptTokens;
        private Integer completionTokens;
    }
}
