package com.kyra.integration.dto;

import com.kyra.integration.model.Webhook;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookDTO {

    private UUID id;
    private UUID tenantId;
    private String url;
    private String[] events;
    private Webhook.WebhookStatus status;
    private Integer failureCount;
    private Instant lastTriggeredAt;
    private Instant createdAt;
    private Instant updatedAt;

    public static WebhookDTO fromEntity(Webhook entity) {
        return WebhookDTO.builder()
                .id(entity.getId())
                .tenantId(entity.getTenantId())
                .url(entity.getUrl())
                .events(entity.getEvents())
                .status(entity.getStatus())
                .failureCount(entity.getFailureCount())
                .lastTriggeredAt(entity.getLastTriggeredAt())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
