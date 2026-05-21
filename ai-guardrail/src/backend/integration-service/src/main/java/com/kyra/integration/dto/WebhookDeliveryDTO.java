package com.kyra.integration.dto;

import com.kyra.integration.model.WebhookDelivery;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WebhookDeliveryDTO {

    private UUID id;
    private UUID webhookId;
    private String eventType;
    private Map<String, Object> payload;
    private Integer responseStatus;
    private String responseBody;
    private Boolean success;
    private Integer attempt;
    private Instant deliveredAt;

    public static WebhookDeliveryDTO fromEntity(WebhookDelivery entity) {
        return WebhookDeliveryDTO.builder()
                .id(entity.getId())
                .webhookId(entity.getWebhookId())
                .eventType(entity.getEventType())
                .payload(entity.getPayload())
                .responseStatus(entity.getResponseStatus())
                .responseBody(entity.getResponseBody())
                .success(entity.getSuccess())
                .attempt(entity.getAttempt())
                .deliveredAt(entity.getDeliveredAt())
                .build();
    }
}
