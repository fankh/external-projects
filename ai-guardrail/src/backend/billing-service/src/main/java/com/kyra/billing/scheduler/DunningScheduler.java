package com.kyra.billing.scheduler;

import com.kyra.billing.model.Subscription;
import com.kyra.billing.repository.SubscriptionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class DunningScheduler {

    private static final long[] ATTEMPT_DAYS = {3, 7, 14};

    private final SubscriptionRepository repo;

    @Scheduled(cron = "${billing.dunning.cron:0 30 * * * *}", zone = "UTC")
    @Transactional
    public void runDunning() {
        List<Subscription> pastDue = repo.findAll().stream()
                .filter(sub -> sub.getStatus() == Subscription.SubscriptionStatus.PAST_DUE)
                .toList();
        if (pastDue.isEmpty()) return;
        log.info("dunning sweep, {} past-due subscriptions", pastDue.size());
        for (Subscription sub : pastDue) {
            if (sub.getPastDueSince() == null) {
                sub.setPastDueSince(Instant.now());
                repo.save(sub);
                continue;
            }
            int attempts = sub.getDunningAttempts() == null ? 0 : sub.getDunningAttempts();
            if (attempts >= ATTEMPT_DAYS.length) {
                sub.setStatus(Subscription.SubscriptionStatus.CANCELLED);
                repo.save(sub);
                log.warn("dunning exhausted for sub {}, suspending", sub.getId());
                continue;
            }
            long daysSince = Duration.between(sub.getPastDueSince(), Instant.now()).toDays();
            long requiredDays = ATTEMPT_DAYS[attempts];
            if (daysSince >= requiredDays) {
                attemptPayment(sub);
                sub.setDunningAttempts(attempts + 1);
                sub.setLastDunningAt(Instant.now());
                repo.save(sub);
            }
        }
    }

    private void attemptPayment(Subscription sub) {
        log.info("dunning attempt {} for sub {} (tenant {})",
                (sub.getDunningAttempts() == null ? 0 : sub.getDunningAttempts()) + 1,
                sub.getId(), sub.getTenantId());
    }
}
