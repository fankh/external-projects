package com.kyra.analytics.service;

import com.kyra.analytics.dto.QuotaCheckResult;
import com.kyra.analytics.model.UserUsageCurrent;
import com.kyra.analytics.repository.UserUsageCurrentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class QuotaService {

    private static final String QUOTA_CACHE_PREFIX = "quota:user:";

    @Value("${kyra.quota.daily-query-limit:500}")
    private int dailyQueryLimit;

    @Value("${kyra.quota.hourly-query-limit:100}")
    private int hourlyQueryLimit;

    @Value("${kyra.quota.daily-token-limit:500000}")
    private long dailyTokenLimit;

    private final UserUsageCurrentRepository usageCurrentRepository;
    private final RedisTemplate<String, Object> redisTemplate;

    public QuotaCheckResult checkQuota(UUID userId) {
        UserUsageCurrent usage = getOrCreateCurrentUsage(userId);

        // Reset counters if needed
        resetCountersIfNeeded(usage);

        int dailyRemaining = Math.max(0, dailyQueryLimit - usage.getQueriesToday());
        int hourlyRemaining = Math.max(0, hourlyQueryLimit - usage.getQueriesThisHour());
        int remaining = Math.min(dailyRemaining, hourlyRemaining);

        boolean allowed = remaining > 0 && usage.getTokensToday() < dailyTokenLimit;

        Instant resetAt;
        if (hourlyRemaining <= 0) {
            resetAt = usage.getHourResetAt();
        } else {
            resetAt = usage.getDayResetAt();
        }

        return QuotaCheckResult.builder()
                .allowed(allowed)
                .remaining(remaining)
                .limit(dailyQueryLimit)
                .resetAt(resetAt)
                .quotaTier("default")
                .build();
    }

    @Transactional
    public void incrementUsage(UUID userId, int queryCount, long totalTokens) {
        UserUsageCurrent usage = getOrCreateCurrentUsage(userId);
        resetCountersIfNeeded(usage);

        usage.setQueriesToday(usage.getQueriesToday() + queryCount);
        usage.setTokensToday(usage.getTokensToday() + totalTokens);
        usage.setQueriesThisHour(usage.getQueriesThisHour() + queryCount);
        usage.setTokensThisHour(usage.getTokensThisHour() + totalTokens);
        usage.setLastQueryAt(Instant.now());

        usageCurrentRepository.save(usage);

        // Update cache
        try {
            String cacheKey = QUOTA_CACHE_PREFIX + userId;
            redisTemplate.opsForValue().set(cacheKey, usage, Duration.ofMinutes(5));
        } catch (Exception e) {
            log.warn("Failed to update quota cache for user {}: {}", userId, e.getMessage());
        }
    }

    private UserUsageCurrent getOrCreateCurrentUsage(UUID userId) {
        return usageCurrentRepository.findByUserId(userId)
                .orElseGet(() -> {
                    Instant now = Instant.now();
                    Instant nextHour = now.plusSeconds(3600 - (now.getEpochSecond() % 3600));
                    Instant nextDay = LocalDate.now().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();

                    UserUsageCurrent newUsage = UserUsageCurrent.builder()
                            .userId(userId)
                            .queriesToday(0)
                            .tokensToday(0L)
                            .queriesThisHour(0)
                            .tokensThisHour(0L)
                            .hourResetAt(nextHour)
                            .dayResetAt(nextDay)
                            .build();
                    return usageCurrentRepository.save(newUsage);
                });
    }

    private void resetCountersIfNeeded(UserUsageCurrent usage) {
        Instant now = Instant.now();

        if (usage.getDayResetAt() != null && now.isAfter(usage.getDayResetAt())) {
            usage.setQueriesToday(0);
            usage.setTokensToday(0L);
            usage.setDayResetAt(LocalDate.now().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant());
            log.debug("Reset daily counters for user {}", usage.getUserId());
        }

        if (usage.getHourResetAt() != null && now.isAfter(usage.getHourResetAt())) {
            usage.setQueriesThisHour(0);
            usage.setTokensThisHour(0L);
            usage.setHourResetAt(now.plusSeconds(3600 - (now.getEpochSecond() % 3600)));
            log.debug("Reset hourly counters for user {}", usage.getUserId());
        }
    }
}
