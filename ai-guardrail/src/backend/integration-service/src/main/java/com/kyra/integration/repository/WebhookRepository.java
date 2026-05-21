package com.kyra.integration.repository;

import com.kyra.integration.model.Webhook;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface WebhookRepository extends JpaRepository<Webhook, UUID> {

    Page<Webhook> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    List<Webhook> findByTenantIdAndStatus(UUID tenantId, Webhook.WebhookStatus status);

    Optional<Webhook> findByIdAndTenantId(UUID id, UUID tenantId);

    @Modifying
    @Query("UPDATE Webhook w SET w.failureCount = w.failureCount + 1 WHERE w.id = :id")
    void incrementFailureCount(@Param("id") UUID id);

    @Modifying
    @Query("UPDATE Webhook w SET w.failureCount = 0 WHERE w.id = :id")
    void resetFailureCount(@Param("id") UUID id);

    @Query(value = "SELECT * FROM webhooks WHERE status = 'active' AND :eventType = ANY(events)", nativeQuery = true)
    List<Webhook> findActiveWebhooksForEvent(@Param("eventType") String eventType);
}
