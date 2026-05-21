package com.kyra.tenant.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kyra.tenant.dto.TenantContextDTO;
import com.kyra.tenant.model.Tenant;
import com.kyra.tenant.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.NoSuchElementException;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantContextService {

    private static final String CACHE_PREFIX = "tenant:context:";
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private final TenantRepository tenantRepository;
    private final StringRedisTemplate redisTemplate;
    private final ObjectMapper objectMapper;

    /**
     * Resolve tenant context by ID. Checks Redis cache first, falls back to DB.
     * Validates tenant is active or in trial.
     */
    public TenantContextDTO resolveById(UUID tenantId) {
        String cacheKey = CACHE_PREFIX + tenantId;
        TenantContextDTO cached = getFromCache(cacheKey);
        if (cached != null) {
            return cached;
        }

        Tenant tenant = tenantRepository.findById(tenantId)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + tenantId));

        validateTenantActive(tenant);

        TenantContextDTO context = toContextDTO(tenant);
        putInCache(cacheKey, context);
        return context;
    }

    /**
     * Resolve tenant context by slug (from subdomain or header).
     * Checks Redis cache first, falls back to DB.
     */
    public TenantContextDTO resolveBySlug(String slug) {
        String cacheKey = CACHE_PREFIX + "slug:" + slug;
        TenantContextDTO cached = getFromCache(cacheKey);
        if (cached != null) {
            return cached;
        }

        Tenant tenant = tenantRepository.findBySlug(slug)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + slug));

        validateTenantActive(tenant);

        TenantContextDTO context = toContextDTO(tenant);
        putInCache(cacheKey, context);
        // Also cache by ID for consistency
        putInCache(CACHE_PREFIX + tenant.getId(), context);
        return context;
    }

    /**
     * Validate that tenant is in an active state (active or trial).
     */
    public void validateTenantActive(Tenant tenant) {
        if (tenant.getStatus() == Tenant.TenantStatus.suspended) {
            throw new TenantSuspendedException("Tenant is suspended: " + tenant.getSlug());
        }
        if (tenant.getStatus() == Tenant.TenantStatus.cancelled) {
            throw new TenantCancelledException("Tenant is cancelled: " + tenant.getSlug());
        }
    }

    /**
     * Evict cached context for a tenant (by ID or slug key).
     */
    public void evictCache(String key) {
        redisTemplate.delete(CACHE_PREFIX + key);
        redisTemplate.delete(CACHE_PREFIX + "slug:" + key);
    }

    private TenantContextDTO getFromCache(String key) {
        try {
            String json = redisTemplate.opsForValue().get(key);
            if (json != null) {
                return objectMapper.readValue(json, TenantContextDTO.class);
            }
        } catch (Exception e) {
            log.warn("Failed to read tenant context from cache: key={}, error={}", key, e.getMessage());
        }
        return null;
    }

    private void putInCache(String key, TenantContextDTO context) {
        try {
            String json = objectMapper.writeValueAsString(context);
            redisTemplate.opsForValue().set(key, json, CACHE_TTL);
        } catch (JsonProcessingException e) {
            log.warn("Failed to cache tenant context: key={}, error={}", key, e.getMessage());
        }
    }

    private TenantContextDTO toContextDTO(Tenant tenant) {
        return TenantContextDTO.builder()
                .tenantId(tenant.getId())
                .slug(tenant.getSlug())
                .tier(tenant.getTier().name())
                .status(tenant.getStatus().name())
                .features(tenant.getFeatures())
                .limits(tenant.getLimits())
                .build();
    }

    // Custom exceptions for tenant state
    public static class TenantSuspendedException extends RuntimeException {
        public TenantSuspendedException(String message) {
            super(message);
        }
    }

    public static class TenantCancelledException extends RuntimeException {
        public TenantCancelledException(String message) {
            super(message);
        }
    }
}
