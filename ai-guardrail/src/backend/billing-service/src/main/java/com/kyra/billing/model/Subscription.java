package com.kyra.billing.model;

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
@Table(name = "subscriptions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "stripe_subscription_id", unique = true)
    private String stripeSubscriptionId;

    @Column(name = "stripe_customer_id", nullable = false)
    private String stripeCustomerId;

    @Column(name = "plan_id", nullable = false, length = 100)
    private String planId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private SubscriptionStatus status = SubscriptionStatus.TRIALING;

    @Column(name = "current_period_start")
    private Instant currentPeriodStart;

    @Column(name = "current_period_end")
    private Instant currentPeriodEnd;

    @Column(name = "trial_end")
    private Instant trialEnd;

    @Column(name = "cancel_at")
    private Instant cancelAt;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> metadata = Map.of();

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;

    public enum SubscriptionStatus {
        TRIALING, ACTIVE, PAST_DUE, CANCELLED, PAUSED;

        public static SubscriptionStatus fromStripe(String stripeStatus) {
            return switch (stripeStatus) {
                case "trialing" -> TRIALING;
                case "active" -> ACTIVE;
                case "past_due" -> PAST_DUE;
                case "canceled", "cancelled" -> CANCELLED;
                case "paused" -> PAUSED;
                default -> throw new IllegalArgumentException("Unknown Stripe status: " + stripeStatus);
            };
        }

        public String toDbValue() {
            return name().toLowerCase();
        }
    }

    @jakarta.persistence.Column(name = "paused_at")
    private java.time.Instant pausedAt;

    @jakarta.persistence.Column(name = "past_due_since")
    private java.time.Instant pastDueSince;

    @jakarta.persistence.Column(name = "dunning_attempts", nullable = false)
    @lombok.Builder.Default
    private Integer dunningAttempts = 0;

    @jakarta.persistence.Column(name = "last_dunning_at")
    private java.time.Instant lastDunningAt;

    @jakarta.persistence.Column(name = "trial_ends_at")
    private java.time.Instant trialEndsAt;
}
