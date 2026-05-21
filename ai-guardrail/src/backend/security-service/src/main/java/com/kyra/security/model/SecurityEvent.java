package com.kyra.security.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "security_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SecurityEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DlpPattern.Severity severity;

    @Column(columnDefinition = "TEXT")
    private String triggerContent;

    private String detectionMethod;

    private Double confidenceScore;

    private String actionTaken;

    private UUID conversationId;

    private UUID messageId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Builder.Default
    @Column(nullable = false)
    private Boolean reviewed = false;

    private UUID reviewedBy;

    private Instant reviewedAt;

    @Column(columnDefinition = "TEXT")
    private String reviewNotes;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    public enum EventType {
        DLP_VIOLATION, PROMPT_INJECTION, RATE_LIMIT, ANOMALY,
        UNAUTHORIZED_ACCESS, DATA_EXFILTRATION, POLICY_VIOLATION
    }
}
