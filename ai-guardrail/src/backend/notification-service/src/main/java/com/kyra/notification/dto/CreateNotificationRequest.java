package com.kyra.notification.dto;

import com.kyra.notification.model.Notification;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateNotificationRequest {

    @NotNull(message = "User ID must not be null")
    private UUID userId;

    @Builder.Default
    private Notification.NotificationType type = Notification.NotificationType.info;

    @NotBlank(message = "Title must not be blank")
    private String title;

    @NotBlank(message = "Message must not be blank")
    private String message;

    private String actionUrl;

    private Map<String, Object> metadata;
}
