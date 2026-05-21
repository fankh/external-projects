package com.kyra.billing.scheduler;

import com.kyra.billing.model.Subscription;
import com.kyra.billing.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

/**
 * Convert TRIALING subscriptions whose trial period has elapsed into ACTIVE.
 * Real Stripe integration would create a charge here; for now we transition
 * status and log the event so downstream (notification-service) can dispatch
 * the conversion email.
 *
 * Runs daily at 04:00 UTC (well after audit retention cron).
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TrialConversionScheduler {

    private final SubscriptionRepository repo;

    @Scheduled(cron = "${billing.trial-conversion.cron:0 0 4 * * *}", zone = "UTC")
    @Transactional
    public void convertExpiredTrials() {
        Instant now = Instant.now();
        List<Subscription> trialing = repo.findAll().stream()
            .filter(s -> s.getStatus() == Subscription.SubscriptionStatus.TRIALING)
            .filter(s -> s.getTrialEndsAt() != null && s.getTrialEndsAt().isBefore(now))
            .toList();
        if (trialing.isEmpty()) return;
        log.info("trial conversion sweep — {} subscriptions due", trialing.size());
        for (Subscription sub : trialing) {
            try {
                sub.setStatus(Subscription.SubscriptionStatus.ACTIVE);
                sub.setCurrentPeriodStart(now);
                if (sub.getCurrentPeriodEnd() == null || sub.getCurrentPeriodEnd().isBefore(now)) {
                    sub.setCurrentPeriodEnd(now.plus(java.time.Duration.ofDays(30)));
                }
                repo.save(sub);
                log.info("trial converted to ACTIVE: sub={} tenant={}", sub.getId(), sub.getTenantId());
                // TODO: emit conversion event to notification-service for email
            } catch (Exception e) {
                log.error("trial conversion failed for sub {}: {}", sub.getId(), e.getMessage());
            }
        }
    }
}
