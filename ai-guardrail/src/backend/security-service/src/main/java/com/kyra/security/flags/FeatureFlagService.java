package com.kyra.security.flags;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FeatureFlagService {
    private static final String CACHE_PREFIX = "ff:";
    private static final Duration CACHE_TTL = Duration.ofMinutes(2);

    private final FeatureFlagRepository repo;
    private final RedisTemplate<String, Object> redisTemplate;

    /** Evaluate a flag for a tenant. Checks: tenant override → percentage → global. */
    public boolean isEnabled(String key, UUID tenantId) {
        FeatureFlag flag = repo.findByKey(key).orElse(null);
        if (flag == null) return false;

        // Tenant override
        if (tenantId != null && flag.getTenantOverrides() != null) {
            Boolean override = flag.getTenantOverrides().get(tenantId.toString());
            if (override != null) return override;
        }

        // Percentage rollout
        if (flag.getPercentage() != null && tenantId != null) {
            int bucket = Math.abs(tenantId.hashCode() % 100);
            return bucket < flag.getPercentage();
        }

        return Boolean.TRUE.equals(flag.getEnabled());
    }
}
