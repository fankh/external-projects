package com.kyra.notification.dto;

import com.kyra.notification.model.Notification;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationDTO {

    private UUID id;
    private UUID userId;
    private Notification.NotificationType type;
    private String title;
    private String message;
    private Notification.NotificationStatus status;
    private String actionUrl;
    private Map<String, Object> metadata;
    private Instant createdAt;
    private Instant readAt;

    public static NotificationDTO fromEntity(Notification entity) {
        return NotificationDTO.builder()
                .id(entity.getId())
                .userId(entity.getUserId())
                .type(entity.getType())
                .title(entity.getTitle())
                .message(entity.getMessage())
                .status(entity.getStatus())
                .actionUrl(entity.getActionUrl())
                .metadata(entity.getMetadata())
                .createdAt(entity.getCreatedAt())
                .readAt(entity.getReadAt())
                .build();
    }
}
