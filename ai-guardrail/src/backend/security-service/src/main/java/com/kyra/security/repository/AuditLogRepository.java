package com.kyra.security.repository;

import com.kyra.security.model.AuditLog;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

    List<AuditLog> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Page<AuditLog> findAll(Pageable pageable);

    Page<AuditLog> findByUserId(UUID userId, Pageable pageable);

    List<AuditLog> findByCreatedAtBetween(Instant start, Instant end);

    // Most recent entry_hash per tenant (for chain linkage). Nullable when first entry.
    @Query(value = """
            SELECT entry_hash FROM audit_logs
            WHERE (tenant_id = :tenantId OR (:tenantId IS NULL AND tenant_id IS NULL))
            ORDER BY created_at DESC, id DESC LIMIT 1
            """, nativeQuery = true)
    Optional<String> findLatestEntryHash(@Param("tenantId") UUID tenantId);

    // Full chain walk for verification (non-held and held alike, ordered for hashing)
    @Query("SELECT a FROM AuditLog a WHERE (:tenantId IS NULL OR a.tenantId = :tenantId) " +
            "AND a.createdAt >= :from AND a.createdAt <= :to " +
            "ORDER BY a.createdAt ASC, a.id ASC")
    List<AuditLog> findChain(@Param("tenantId") UUID tenantId,
                             @Param("from") Instant from,
                             @Param("to") Instant to);

    @Modifying
    @Query(value = "DELETE FROM audit_logs WHERE tenant_id = :tenantId " +
                   "AND created_at < :cutoff AND legal_hold = FALSE", nativeQuery = true)
    int deleteExpiredForTenant(@Param("tenantId") UUID tenantId, @Param("cutoff") Instant cutoff);
}
