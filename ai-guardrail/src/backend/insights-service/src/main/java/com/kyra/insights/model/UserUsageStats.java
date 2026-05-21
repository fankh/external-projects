package com.kyra.insights.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "user_usage_stats")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserUsageStats {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private LocalDate date;

    @Column(name = "query_count", nullable = false)
    private Integer queryCount;

    @Column(name = "document_count", nullable = false)
    private Integer documentCount;

    @Column(name = "token_count", nullable = false)
    private Integer tokenCount;

    @Column(name = "estimated_minutes_saved", nullable = false)
    private Integer estimatedMinutesSaved;

    @Column(name = "conversation_count", nullable = false)
    private Integer conversationCount;

    @Column(name = "bookmark_count", nullable = false)
    private Integer bookmarkCount;

    @Column(name = "persona_usage", columnDefinition = "JSONB")
    private String personaUsage;

    @Column(name = "top_topics", columnDefinition = "JSONB")
    private String topTopics;
}
