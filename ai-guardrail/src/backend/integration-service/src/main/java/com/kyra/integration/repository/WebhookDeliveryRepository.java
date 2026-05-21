package com.kyra.integration.repository;

import com.kyra.integration.model.WebhookDelivery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface WebhookDeliveryRepository extends JpaRepository<WebhookDelivery, UUID> {

    Page<WebhookDelivery> findByWebhookIdOrderByDeliveredAtDesc(UUID webhookId, Pageable pageable);

    List<WebhookDelivery> findByWebhookIdAndSuccessFalseAndAttemptLessThan(UUID webhookId, int maxAttempts);
}
