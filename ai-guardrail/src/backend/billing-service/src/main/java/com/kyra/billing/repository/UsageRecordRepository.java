package com.kyra.billing.repository;

import com.kyra.billing.model.UsageRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface UsageRecordRepository extends JpaRepository<UsageRecord, UUID> {

    List<UsageRecord> findByTenantIdAndRecordedAtBetween(UUID tenantId, Instant start, Instant end);

    @Query("SELECT u.metric, SUM(u.quantity) FROM UsageRecord u " +
           "WHERE u.tenantId = :tenantId AND u.recordedAt BETWEEN :start AND :end " +
           "GROUP BY u.metric")
    List<Object[]> sumQuantityByMetric(@Param("tenantId") UUID tenantId,
                                       @Param("start") Instant start,
                                       @Param("end") Instant end);

    List<UsageRecord> findByTenantIdOrderByRecordedAtDesc(UUID tenantId);
}
