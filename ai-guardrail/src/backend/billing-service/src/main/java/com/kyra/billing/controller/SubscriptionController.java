package com.kyra.billing.controller;

import com.kyra.billing.dto.CreateSubscriptionRequest;
import com.kyra.billing.dto.SubscriptionDTO;
import com.kyra.billing.service.SubscriptionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/billing/subscriptions")
@RequiredArgsConstructor
@Slf4j
public class SubscriptionController {

    private final SubscriptionService subscriptionService;

    @PostMapping
    public ResponseEntity<SubscriptionDTO> createSubscription(
            @Valid @RequestBody CreateSubscriptionRequest request) {
        log.info("Creating subscription for tenant {} on plan {}", request.getTenantId(), request.getPlanId());
        SubscriptionDTO subscription = subscriptionService.createSubscription(request);
        return ResponseEntity.ok(subscription);
    }

    @GetMapping("/{tenantId}")
    public ResponseEntity<SubscriptionDTO> getSubscription(@PathVariable UUID tenantId) {
        log.info("Getting subscription for tenant {}", tenantId);
        SubscriptionDTO subscription = subscriptionService.getSubscription(tenantId);
        return ResponseEntity.ok(subscription);
    }

    @PostMapping("/{id}/upgrade")
    public ResponseEntity<SubscriptionDTO> upgradePlan(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        String newPlanId = body.get("planId");
        log.info("Upgrading subscription {} to plan {}", id, newPlanId);
        SubscriptionDTO subscription = subscriptionService.upgradePlan(id, newPlanId);
        return ResponseEntity.ok(subscription);
    }

    @PostMapping("/{id}/downgrade")
    public ResponseEntity<SubscriptionDTO> downgradePlan(
            @PathVariable UUID id,
            @RequestBody Map<String, String> body) {
        String newPlanId = body.get("planId");
        log.info("Downgrading subscription {} to plan {}", id, newPlanId);
        SubscriptionDTO subscription = subscriptionService.downgradePlan(id, newPlanId);
        return ResponseEntity.ok(subscription);
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<SubscriptionDTO> cancelSubscription(@PathVariable UUID id) {
        log.info("Cancelling subscription {}", id);
        SubscriptionDTO subscription = subscriptionService.cancelSubscription(id);
        return ResponseEntity.ok(subscription);
    }

    @PostMapping("/{id}/pause")
    public ResponseEntity<SubscriptionDTO> pauseSubscription(
            @PathVariable UUID id,
            @RequestParam(defaultValue = "true") boolean prorate) {
        log.info("Pausing subscription {} (prorate={})", id, prorate);
        return ResponseEntity.ok(subscriptionService.pauseSubscription(id, prorate));
    }

    @PostMapping("/{id}/resume")
    public ResponseEntity<SubscriptionDTO> resumeSubscription(@PathVariable UUID id) {
        log.info("Resuming subscription {}", id);
        SubscriptionDTO subscription = subscriptionService.resumeSubscription(id);
        return ResponseEntity.ok(subscription);
    }
}
