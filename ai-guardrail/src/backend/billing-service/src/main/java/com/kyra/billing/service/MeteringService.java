package com.kyra.billing.service;

import com.kyra.billing.dto.UsageSummaryDTO;
import com.kyra.billing.model.Subscription;
import com.kyra.billing.model.UsageRecord;
import com.kyra.billing.repository.SubscriptionRepository;
import com.kyra.billing.repository.UsageRecordRepository;
import com.stripe.exception.StripeException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class MeteringService {

    private final UsageRecordRepository usageRecordRepository;
    private final SubscriptionRepository subscriptionRepository;
    private final StripeService stripeService;

    @Transactional
    public UsageRecord recordUsage(UUID tenantId, String metric, long quantity) {
        Subscription subscription = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId)
                .orElse(null);

        UsageRecord record = UsageRecord.builder()
                .tenantId(tenantId)
                .subscription(subscription)
                .metric(metric)
                .quantity(quantity)
                .recordedAt(Instant.now())
                .build();

        // Report to Stripe if subscription has metered billing
        if (subscription != null && subscription.getStripeSubscriptionId() != null) {
            try {
                com.stripe.model.Subscription stripeSub = com.stripe.model.Subscription.retrieve(
                        subscription.getStripeSubscriptionId());
                if (!stripeSub.getItems().getData().isEmpty()) {
                    String subscriptionItemId = stripeSub.getItems().getData().get(0).getId();
                    com.stripe.model.UsageRecord stripeRecord = stripeService.createUsageRecord(
                            subscriptionItemId, quantity, Instant.now().getEpochSecond());
                    record.setStripeUsageRecordId(stripeRecord.getId());
                }
            } catch (StripeException e) {
                log.warn("Failed to report usage to Stripe for tenant {}: {}", tenantId, e.getMessage());
                // Still save locally even if Stripe reporting fails
            }
        }

        record = usageRecordRepository.save(record);
        log.debug("Recorded usage for tenant {} metric={} quantity={}", tenantId, metric, quantity);
        return record;
    }

    public UsageSummaryDTO getUsageSummary(UUID tenantId) {
        Instant now = Instant.now();
        Instant periodStart = now.minus(30, ChronoUnit.DAYS);

        return getUsageSummary(tenantId, periodStart, now);
    }

    public UsageSummaryDTO getUsageSummary(UUID tenantId, Instant periodStart, Instant periodEnd) {
        List<Object[]> results = usageRecordRepository.sumQuantityByMetric(tenantId, periodStart, periodEnd);

        Map<String, Long> metricTotals = new LinkedHashMap<>();
        for (Object[] row : results) {
            String metric = (String) row[0];
            Long total = (Long) row[1];
            metricTotals.put(metric, total);
        }

        List<UsageRecord> records = usageRecordRepository.findByTenantIdAndRecordedAtBetween(
                tenantId, periodStart, periodEnd);

        return UsageSummaryDTO.builder()
                .tenantId(tenantId)
                .periodStart(periodStart)
                .periodEnd(periodEnd)
                .metricTotals(metricTotals)
                .totalRecords(records.size())
                .build();
    }
}
