package com.kyra.security.keys;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class TenantKeyService {

    private final TenantKeyRepository repo;
    private final AuditService auditService;

    /** Create the very first key for a tenant if missing. */
    @Transactional
    public TenantKey ensureKey(UUID tenantId) {
        return repo.findFirstByTenantIdAndState(tenantId, "ACTIVE").orElseGet(() -> {
            TenantKey k = TenantKey.builder()
                .tenantId(tenantId)
                .keyAlias("kyra/tenant/" + tenantId)
                .keyVersion(1)
                .state("ACTIVE")
                .metadata(Map.of("provider", "local"))
                .build();
            k = repo.save(k);
            auditService.logAuditEvent(tenantId, null, "encryption.key.created",
                "tenant_key", k.getId().toString(),
                Map.of("alias", k.getKeyAlias(), "version", k.getKeyVersion(), "algorithm", k.getAlgorithm()),
                "SUCCESS", null, null);
            return k;
        });
    }

    /**
     * Rotate the active key. Marks current ACTIVE → PENDING_DEACTIVATION,
     * creates new key with version+1, leaves a 30-day window before final
     * DEACTIVATION (so any envelope-encrypted blobs can be re-wrapped).
     */
    @Transactional
    public TenantKey rotate(UUID tenantId, UUID actor) {
        TenantKey current = repo.findFirstByTenantIdAndState(tenantId, "ACTIVE")
            .orElseGet(() -> ensureKey(tenantId));
        current.setState("PENDING_DEACTIVATION");
        current.setDeactivatedAt(Instant.now().plus(30, ChronoUnit.DAYS));
        repo.saveAndFlush(current);

        TenantKey next = TenantKey.builder()
            .tenantId(tenantId)
            .keyAlias(current.getKeyAlias())
            .keyVersion(current.getKeyVersion() + 1)
            .state("ACTIVE")
            .metadata(Map.of("provider", "local", "rotated_from", current.getId().toString()))
            .build();
        next = repo.save(next);
        auditService.logAuditEvent(tenantId, actor, "encryption.key.rotated",
            "tenant_key", next.getId().toString(),
            Map.of("oldVersion", current.getKeyVersion(), "newVersion", next.getKeyVersion(),
                   "windowEnds", current.getDeactivatedAt().toString()),
            "SUCCESS", null, null);
        log.info("rotated key for tenant {}: v{} -> v{}", tenantId, current.getKeyVersion(), next.getKeyVersion());
        return next;
    }

    /** Final deactivation pass — runs daily, kills keys past their grace window. */
    @Transactional
    public int reapExpiredPendingKeys() {
        Instant now = Instant.now();
        List<TenantKey> pending = repo.findAll().stream()
            .filter(k -> "PENDING_DEACTIVATION".equals(k.getState()))
            .filter(k -> k.getDeactivatedAt() != null && k.getDeactivatedAt().isBefore(now))
            .toList();
        for (TenantKey k : pending) {
            k.setState("DEACTIVATED");
            repo.save(k);
            auditService.logAuditEvent(k.getTenantId(), null, "encryption.key.deactivated",
                "tenant_key", k.getId().toString(),
                Map.of("version", k.getKeyVersion()), "SUCCESS", null, null);
        }
        return pending.size();
    }

    public List<TenantKey> listForTenant(UUID tenantId) {
        return repo.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }
}
