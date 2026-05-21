package com.kyra.tenant.service;

import com.kyra.tenant.dto.*;
import com.kyra.tenant.model.Tenant;
import com.kyra.tenant.repository.TenantRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantService {

    private final TenantRepository tenantRepository;
    private final TenantContextService tenantContextService;

    @Transactional
    public TenantDTO createTenant(CreateTenantRequest request) {
        if (tenantRepository.existsBySlug(request.getSlug())) {
            throw new IllegalArgumentException("Tenant slug already exists: " + request.getSlug());
        }

        Tenant.TenantTier tier = Tenant.TenantTier.starter;
        if (request.getTier() != null) {
            tier = Tenant.TenantTier.valueOf(request.getTier().toLowerCase());
        }

        Tenant tenant = Tenant.builder()
                .name(request.getName())
                .slug(request.getSlug())
                .tier(tier)
                .status(Tenant.TenantStatus.trial)
                .isolationLevel(Tenant.IsolationLevel.row)
                .trialEndsAt(Instant.now().plus(14, ChronoUnit.DAYS))
                .build();

        // Apply tier-specific limits
        tenant.setLimits(getDefaultLimitsForTier(tier));
        tenant.setFeatures(getDefaultFeaturesForTier(tier));

        Tenant saved = tenantRepository.save(tenant);
        log.info("Created new tenant: slug={}, tier={}, id={}", saved.getSlug(), saved.getTier(), saved.getId());

        // Invalidate any cached context for this slug
        tenantContextService.evictCache(saved.getId().toString());
        tenantContextService.evictCache(saved.getSlug());

        return toDTO(saved);
    }

    @Transactional(readOnly = true)
    public TenantDTO getTenant(UUID id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + id));
        return toDTO(tenant);
    }

    @Transactional(readOnly = true)
    public TenantDTO getTenantBySlug(String slug) {
        Tenant tenant = tenantRepository.findBySlug(slug)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + slug));
        return toDTO(tenant);
    }

    @Transactional(readOnly = true)
    public List<TenantDTO> listTenants() {
        return tenantRepository.findAll().stream()
                .map(this::toDTO)
                .toList();
    }

    @Transactional
    public TenantDTO updateTenant(UUID id, UpdateTenantRequest request) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + id));

        if (request.getName() != null) {
            tenant.setName(request.getName());
        }
        if (request.getTier() != null) {
            tenant.setTier(Tenant.TenantTier.valueOf(request.getTier().toLowerCase()));
        }
        if (request.getSettings() != null) {
            Map<String, Object> merged = new HashMap<>(tenant.getSettings());
            merged.putAll(request.getSettings());
            tenant.setSettings(merged);
        }
        if (request.getFeatures() != null) {
            Map<String, Object> merged = new HashMap<>(tenant.getFeatures());
            merged.putAll(request.getFeatures());
            tenant.setFeatures(merged);
        }
        if (request.getLimits() != null) {
            Map<String, Object> merged = new HashMap<>(tenant.getLimits());
            merged.putAll(request.getLimits());
            tenant.setLimits(merged);
        }
        if (request.getBranding() != null) {
            Map<String, Object> merged = new HashMap<>(tenant.getBranding());
            merged.putAll(request.getBranding());
            tenant.setBranding(merged);
        }
        if (request.getCustomDomain() != null) {
            tenant.setCustomDomain(request.getCustomDomain());
        }

        Tenant saved = tenantRepository.save(tenant);
        log.info("Updated tenant: id={}, slug={}", saved.getId(), saved.getSlug());

        // Invalidate cached context
        tenantContextService.evictCache(saved.getId().toString());
        tenantContextService.evictCache(saved.getSlug());

        return toDTO(saved);
    }

    @Transactional
    public TenantDTO suspendTenant(UUID id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + id));

        if (tenant.getStatus() == Tenant.TenantStatus.cancelled) {
            throw new IllegalStateException("Cannot suspend a cancelled tenant");
        }

        tenant.setStatus(Tenant.TenantStatus.suspended);
        Tenant saved = tenantRepository.save(tenant);
        log.info("Suspended tenant: id={}, slug={}", saved.getId(), saved.getSlug());

        tenantContextService.evictCache(saved.getId().toString());
        tenantContextService.evictCache(saved.getSlug());

        return toDTO(saved);
    }

    @Transactional
    public TenantDTO activateTenant(UUID id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + id));

        if (tenant.getStatus() == Tenant.TenantStatus.cancelled) {
            throw new IllegalStateException("Cannot activate a cancelled tenant");
        }

        tenant.setStatus(Tenant.TenantStatus.active);
        Tenant saved = tenantRepository.save(tenant);
        log.info("Activated tenant: id={}, slug={}", saved.getId(), saved.getSlug());

        tenantContextService.evictCache(saved.getId().toString());
        tenantContextService.evictCache(saved.getSlug());

        return toDTO(saved);
    }

    @Transactional
    public void deactivateTenant(UUID id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + id));

        // GDPR Art.20 — generate a portability bundle BEFORE soft-delete so admins
        // can hand off data to the tenant. Stored at /tmp/tenant-exports/{id}.json.
        try {
            byte[] bundle = exportTenantBundle(tenant);
            java.io.File dir = new java.io.File("/tmp/tenant-exports");
            if (!dir.exists()) dir.mkdirs();
            java.io.File out = new java.io.File(dir, tenant.getId() + ".json");
            java.nio.file.Files.write(out.toPath(), bundle);
            log.info("Tenant export written: {} ({} bytes)", out.getAbsolutePath(), bundle.length);
        } catch (Exception e) {
            log.warn("Tenant export failed (continuing with deactivation): {}", e.getMessage());
        }

        tenant.setStatus(Tenant.TenantStatus.cancelled);
        tenantRepository.save(tenant);
        log.info("Deactivated (soft deleted) tenant: id={}, slug={}", tenant.getId(), tenant.getSlug());

        tenantContextService.evictCache(tenant.getId().toString());
        tenantContextService.evictCache(tenant.getSlug());
    }

    public byte[] exportTenantBundle(Tenant tenant) throws java.io.IOException {
        java.util.Map<String, Object> bundle = new java.util.LinkedHashMap<>();
        bundle.put("exportedAt", java.time.Instant.now().toString());
        bundle.put("tenant", java.util.Map.of(
            "id", tenant.getId().toString(),
            "slug", tenant.getSlug(),
            "name", tenant.getName(),
            "tier", tenant.getTier() == null ? "" : tenant.getTier().name(),
            "status", tenant.getStatus() == null ? "" : tenant.getStatus().name(),
            "settings", tenant.getSettings() == null ? java.util.Map.of() : tenant.getSettings(),
            "features", tenant.getFeatures() == null ? java.util.Map.of() : tenant.getFeatures(),
            "limits", tenant.getLimits() == null ? java.util.Map.of() : tenant.getLimits(),
            "createdAt", tenant.getCreatedAt() == null ? "" : tenant.getCreatedAt().toString()
        ));
        bundle.put("note", "Per-user conversation/document data lives in chat-service/rag-service. " +
                           "Use their tenant-scoped export endpoints (forthcoming) to bundle full subject data.");
        com.fasterxml.jackson.databind.ObjectMapper m = new com.fasterxml.jackson.databind.ObjectMapper();
        return m.writerWithDefaultPrettyPrinter().writeValueAsBytes(bundle);
    }

    @Transactional(readOnly = true)
    public TenantContextDTO getTenantContext(UUID id) {
        Tenant tenant = tenantRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + id));
        return toContextDTO(tenant);
    }

    @Transactional(readOnly = true)
    public TenantContextDTO getTenantContextBySlug(String slug) {
        Tenant tenant = tenantRepository.findBySlug(slug)
                .orElseThrow(() -> new NoSuchElementException("Tenant not found: " + slug));
        return toContextDTO(tenant);
    }

    private Map<String, Object> getDefaultLimitsForTier(Tenant.TenantTier tier) {
        return switch (tier) {
            case starter -> Map.of(
                    "maxUsers", 10,
                    "maxStorage", 10737418240L,
                    "maxQueriesPerDay", 1000
            );
            case professional -> Map.of(
                    "maxUsers", 50,
                    "maxStorage", 53687091200L,
                    "maxQueriesPerDay", 10000
            );
            case enterprise -> Map.of(
                    "maxUsers", 500,
                    "maxStorage", 214748364800L,
                    "maxQueriesPerDay", 100000
            );
        };
    }

    private Map<String, Object> getDefaultFeaturesForTier(Tenant.TenantTier tier) {
        return switch (tier) {
            case starter -> Map.of(
                    "ragEnabled", true,
                    "memoryEnabled", true,
                    "streamingEnabled", true,
                    "multiModalEnabled", false,
                    "agentsEnabled", false
            );
            case professional -> Map.of(
                    "ragEnabled", true,
                    "memoryEnabled", true,
                    "streamingEnabled", true,
                    "multiModalEnabled", true,
                    "agentsEnabled", false
            );
            case enterprise -> Map.of(
                    "ragEnabled", true,
                    "memoryEnabled", true,
                    "streamingEnabled", true,
                    "multiModalEnabled", true,
                    "agentsEnabled", true
            );
        };
    }

    private TenantDTO toDTO(Tenant tenant) {
        return TenantDTO.builder()
                .id(tenant.getId())
                .slug(tenant.getSlug())
                .name(tenant.getName())
                .tier(tenant.getTier().name())
                .status(tenant.getStatus().name())
                .isolationLevel(tenant.getIsolationLevel().name())
                .ownerId(tenant.getOwnerId())
                .settings(tenant.getSettings())
                .features(tenant.getFeatures())
                .limits(tenant.getLimits())
                .branding(tenant.getBranding())
                .customDomain(tenant.getCustomDomain())
                .trialEndsAt(tenant.getTrialEndsAt())
                .createdAt(tenant.getCreatedAt())
                .updatedAt(tenant.getUpdatedAt())
                .build();
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
}
