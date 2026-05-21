package com.kyra.security.dto;

import com.kyra.security.model.DlpPattern;
import com.kyra.security.model.SecurityEvent;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SecurityEventDTO {

    private UUID id;
    private UUID userId;
    private SecurityEvent.EventType eventType;
    private DlpPattern.Severity severity;
    private String triggerContent;
    private String detectionMethod;
    private Double confidenceScore;
    private String actionTaken;
    private UUID conversationId;
    private UUID messageId;
    private Map<String, Object> metadata;
    private Boolean reviewed;
    private String reviewedBy;
    private Instant reviewedAt;
    private String reviewNotes;
    private Instant createdAt;

    public static SecurityEventDTO fromEntity(SecurityEvent event) {
        return SecurityEventDTO.builder()
                .id(event.getId())
                .userId(event.getUserId())
                .eventType(event.getEventType())
                .severity(event.getSeverity())
                .triggerContent(event.getTriggerContent())
                .detectionMethod(event.getDetectionMethod())
                .confidenceScore(event.getConfidenceScore())
                .actionTaken(event.getActionTaken())
                .conversationId(event.getConversationId())
                .messageId(event.getMessageId())
                .metadata(event.getMetadata())
                .reviewed(event.getReviewed())
                .reviewedBy(event.getReviewedBy() != null ? event.getReviewedBy().toString() : null)
                .reviewedAt(event.getReviewedAt())
                .reviewNotes(event.getReviewNotes())
                .createdAt(event.getCreatedAt())
                .build();
    }
}
