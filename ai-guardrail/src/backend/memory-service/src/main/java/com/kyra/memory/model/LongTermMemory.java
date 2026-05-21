package com.kyra.memory.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "long_term_memories")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LongTermMemory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    private UUID conversationId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MemoryType memoryType;

    @Column(nullable = false, length = 500)
    private String key;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String value;

    @Builder.Default
    @Column(nullable = false)
    private Float importance = 0.5f;

    @Builder.Default
    @Column(nullable = false)
    private Float confidence = 0.8f;

    @Builder.Default
    @Column(nullable = false)
    private Integer accessCount = 0;

    private Instant lastAccessedAt;

    private UUID sourceMessageId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = Map.of();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private MemoryStatus status = MemoryStatus.ACTIVE;

    private Instant expiresAt;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public enum MemoryType {
        EPISODIC, SEMANTIC, PROCEDURAL, ENTITY
    }

    public enum MemoryStatus {
        ACTIVE, ARCHIVED, EXPIRED
    }
}
