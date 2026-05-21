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
public class StreamChunk {

    private ChunkType type;
    private String content;
    private List<ChatResponse.Source> sources;
    private UUID messageId;
    private UUID conversationId;
    private ChatResponse.TokenUsage tokens;

    public enum ChunkType {
        CONTENT, SOURCES, DONE, ERROR
    }
}
