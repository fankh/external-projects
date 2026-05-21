package com.kyra.memory.dto;

import com.kyra.memory.model.LongTermMemory;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MemoryDTO {

    private UUID id;
    private UUID userId;
    private UUID conversationId;
    private String memoryType;
    private String key;
    private String value;
    private Float importance;
    private Float confidence;
    private Integer accessCount;
    private Instant lastAccessedAt;
    private String status;
    private Map<String, Object> metadata;
    private Instant createdAt;
    private Instant updatedAt;

    public static MemoryDTO fromEntity(LongTermMemory entity) {
        return MemoryDTO.builder()
                .id(entity.getId())
                .userId(entity.getUserId())
                .conversationId(entity.getConversationId())
                .memoryType(entity.getMemoryType().name().toLowerCase())
                .key(entity.getKey())
                .value(entity.getValue())
                .importance(entity.getImportance())
                .confidence(entity.getConfidence())
                .accessCount(entity.getAccessCount())
                .lastAccessedAt(entity.getLastAccessedAt())
                .status(entity.getStatus().name().toLowerCase())
                .metadata(entity.getMetadata())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
