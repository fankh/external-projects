package com.kyra.billing.dto;

import lombok.*;

import java.util.Map;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class StripeWebhookEvent {

    private String id;
    private String type;
    private Map<String, Object> data;
    private long created;
    private boolean livemode;
}
