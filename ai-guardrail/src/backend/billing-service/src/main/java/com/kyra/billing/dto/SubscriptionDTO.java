package com.kyra.billing.dto;

import com.kyra.billing.model.Subscription;
import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionDTO {

    private UUID id;
    private UUID tenantId;
    private String stripeSubscriptionId;
    private String stripeCustomerId;
    private String planId;
    private String status;
    private Instant currentPeriodStart;
    private Instant currentPeriodEnd;
    private Instant trialEnd;
    private Instant cancelAt;
    private Instant cancelledAt;
    private Map<String, Object> metadata;
    private Instant createdAt;
    private Instant updatedAt;

    public static SubscriptionDTO fromEntity(Subscription subscription) {
        return SubscriptionDTO.builder()
                .id(subscription.getId())
                .tenantId(subscription.getTenantId())
                .stripeSubscriptionId(subscription.getStripeSubscriptionId())
                .stripeCustomerId(subscription.getStripeCustomerId())
                .planId(subscription.getPlanId())
                .status(subscription.getStatus().name().toLowerCase())
                .currentPeriodStart(subscription.getCurrentPeriodStart())
                .currentPeriodEnd(subscription.getCurrentPeriodEnd())
                .trialEnd(subscription.getTrialEnd())
                .cancelAt(subscription.getCancelAt())
                .cancelledAt(subscription.getCancelledAt())
                .metadata(subscription.getMetadata())
                .createdAt(subscription.getCreatedAt())
                .updatedAt(subscription.getUpdatedAt())
                .build();
    }
}
