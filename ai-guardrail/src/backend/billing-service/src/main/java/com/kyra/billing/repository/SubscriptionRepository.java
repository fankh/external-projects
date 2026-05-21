package com.kyra.billing.repository;

import com.kyra.billing.model.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SubscriptionRepository extends JpaRepository<Subscription, UUID> {

    List<Subscription> findByTenantId(UUID tenantId);

    Optional<Subscription> findByStripeSubscriptionId(String stripeSubscriptionId);

    Optional<Subscription> findFirstByTenantIdOrderByCreatedAtDesc(UUID tenantId);

    List<Subscription> findByTenantIdAndStatus(UUID tenantId, Subscription.SubscriptionStatus status);
}
