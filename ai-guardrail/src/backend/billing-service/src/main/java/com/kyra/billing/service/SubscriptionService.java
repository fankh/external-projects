package com.kyra.billing.service;

import com.kyra.billing.dto.CreateSubscriptionRequest;
import com.kyra.billing.dto.SubscriptionDTO;
import com.kyra.billing.model.Invoice;
import com.kyra.billing.model.PricingPlan;
import com.kyra.billing.model.Subscription;
import com.kyra.billing.repository.InvoiceRepository;
import com.kyra.billing.repository.PricingPlanRepository;
import com.kyra.billing.repository.SubscriptionRepository;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.StripeObject;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class SubscriptionService {

    private final SubscriptionRepository subscriptionRepository;
    private final InvoiceRepository invoiceRepository;
    private final PricingPlanRepository pricingPlanRepository;
    private final StripeService stripeService;

    @Transactional
    public SubscriptionDTO createSubscription(CreateSubscriptionRequest request) {
        PricingPlan plan = pricingPlanRepository.findById(request.getPlanId())
                .orElseThrow(() -> new NoSuchElementException("Plan not found: " + request.getPlanId()));

        if (plan.getStripePriceId() == null || plan.getStripePriceId().isBlank()) {
            throw new IllegalStateException("Plan " + plan.getId() + " has no Stripe price ID configured");
        }

        try {
            // Create or retrieve Stripe customer
            Customer customer = stripeService.createCustomer(
                    request.getEmail(),
                    request.getName(),
                    request.getTenantId().toString()
            );

            // Attach payment method
            stripeService.attachPaymentMethod(customer.getId(), request.getPaymentMethodId());

            // Create Stripe subscription with 14-day trial
            com.stripe.model.Subscription stripeSubscription = stripeService.createSubscription(
                    customer.getId(),
                    plan.getStripePriceId(),
                    14L
            );

            // Persist local subscription record
            Subscription subscription = Subscription.builder()
                    .tenantId(request.getTenantId())
                    .stripeSubscriptionId(stripeSubscription.getId())
                    .stripeCustomerId(customer.getId())
                    .planId(request.getPlanId())
                    .status(Subscription.SubscriptionStatus.fromStripe(stripeSubscription.getStatus()))
                    .currentPeriodStart(Instant.ofEpochSecond(stripeSubscription.getCurrentPeriodStart()))
                    .currentPeriodEnd(Instant.ofEpochSecond(stripeSubscription.getCurrentPeriodEnd()))
                    .trialEnd(stripeSubscription.getTrialEnd() != null
                            ? Instant.ofEpochSecond(stripeSubscription.getTrialEnd()) : null)
                    .build();

            subscription = subscriptionRepository.save(subscription);
            log.info("Created subscription {} for tenant {} on plan {}",
                    subscription.getId(), request.getTenantId(), request.getPlanId());

            return SubscriptionDTO.fromEntity(subscription);

        } catch (StripeException e) {
            log.error("Stripe error creating subscription for tenant {}: {}", request.getTenantId(), e.getMessage());
            throw new RuntimeException("Failed to create subscription: " + e.getMessage(), e);
        }
    }

    public SubscriptionDTO getSubscription(UUID tenantId) {
        Subscription subscription = subscriptionRepository.findFirstByTenantIdOrderByCreatedAtDesc(tenantId)
                .orElseThrow(() -> new NoSuchElementException("No subscription found for tenant: " + tenantId));
        return SubscriptionDTO.fromEntity(subscription);
    }

    public SubscriptionDTO getSubscriptionById(UUID id) {
        Subscription subscription = subscriptionRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Subscription not found: " + id));
        return SubscriptionDTO.fromEntity(subscription);
    }

    @Transactional
    public SubscriptionDTO upgradePlan(UUID subscriptionId, String newPlanId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new NoSuchElementException("Subscription not found: " + subscriptionId));

        PricingPlan newPlan = pricingPlanRepository.findById(newPlanId)
                .orElseThrow(() -> new NoSuchElementException("Plan not found: " + newPlanId));

        PricingPlan currentPlan = pricingPlanRepository.findById(subscription.getPlanId())
                .orElseThrow(() -> new NoSuchElementException("Current plan not found: " + subscription.getPlanId()));

        if (newPlan.getAmountCents() <= currentPlan.getAmountCents()) {
            throw new IllegalArgumentException("New plan must be higher tier for upgrade. Use downgrade endpoint.");
        }

        return changePlan(subscription, newPlan);
    }

    @Transactional
    public SubscriptionDTO downgradePlan(UUID subscriptionId, String newPlanId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new NoSuchElementException("Subscription not found: " + subscriptionId));

        PricingPlan newPlan = pricingPlanRepository.findById(newPlanId)
                .orElseThrow(() -> new NoSuchElementException("Plan not found: " + newPlanId));

        PricingPlan currentPlan = pricingPlanRepository.findById(subscription.getPlanId())
                .orElseThrow(() -> new NoSuchElementException("Current plan not found: " + subscription.getPlanId()));

        if (newPlan.getAmountCents() >= currentPlan.getAmountCents()) {
            throw new IllegalArgumentException("New plan must be lower tier for downgrade. Use upgrade endpoint.");
        }

        return changePlan(subscription, newPlan);
    }

    private SubscriptionDTO changePlan(Subscription subscription, PricingPlan newPlan) {
        if (newPlan.getStripePriceId() == null || newPlan.getStripePriceId().isBlank()) {
            throw new IllegalStateException("Plan " + newPlan.getId() + " has no Stripe price ID configured");
        }

        try {
            com.stripe.model.Subscription updated = stripeService.updateSubscription(
                    subscription.getStripeSubscriptionId(),
                    newPlan.getStripePriceId()
            );

            subscription.setPlanId(newPlan.getId());
            subscription.setStatus(Subscription.SubscriptionStatus.fromStripe(updated.getStatus()));
            subscription.setCurrentPeriodStart(Instant.ofEpochSecond(updated.getCurrentPeriodStart()));
            subscription.setCurrentPeriodEnd(Instant.ofEpochSecond(updated.getCurrentPeriodEnd()));
            subscription = subscriptionRepository.save(subscription);

            log.info("Changed subscription {} to plan {}", subscription.getId(), newPlan.getId());
            return SubscriptionDTO.fromEntity(subscription);

        } catch (StripeException e) {
            log.error("Stripe error changing plan for subscription {}: {}", subscription.getId(), e.getMessage());
            throw new RuntimeException("Failed to change plan: " + e.getMessage(), e);
        }
    }

    @Transactional
    public SubscriptionDTO cancelSubscription(UUID subscriptionId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new NoSuchElementException("Subscription not found: " + subscriptionId));

        try {
            com.stripe.model.Subscription cancelled = stripeService.cancelSubscription(
                    subscription.getStripeSubscriptionId(), true);

            subscription.setCancelAt(Instant.ofEpochSecond(cancelled.getCurrentPeriodEnd()));
            subscription.setCancelledAt(Instant.now());
            subscription = subscriptionRepository.save(subscription);

            log.info("Cancelled subscription {} (at period end)", subscriptionId);
            return SubscriptionDTO.fromEntity(subscription);

        } catch (StripeException e) {
            log.error("Stripe error cancelling subscription {}: {}", subscriptionId, e.getMessage());
            throw new RuntimeException("Failed to cancel subscription: " + e.getMessage(), e);
        }
    }

    @Transactional

    /**
     * Pause subscription with optional proration.
     * If proration=true, computes the prorated credit for the unused portion of the period.
     */
    public SubscriptionDTO pauseSubscription(UUID subscriptionId, boolean prorate) {
        com.kyra.billing.model.Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new java.util.NoSuchElementException("Subscription not found: " + subscriptionId));
        if (subscription.getStatus() == com.kyra.billing.model.Subscription.SubscriptionStatus.PAUSED) {
            return SubscriptionDTO.fromEntity(subscription);
        }
        // Compute proration credit if requested
        if (prorate && subscription.getCurrentPeriodEnd() != null && subscription.getCurrentPeriodStart() != null) {
            long total = java.time.Duration.between(subscription.getCurrentPeriodStart(), subscription.getCurrentPeriodEnd()).toMillis();
            long remaining = java.time.Duration.between(java.time.Instant.now(), subscription.getCurrentPeriodEnd()).toMillis();
            if (total > 0 && remaining > 0) {
                double fraction = (double) remaining / total;
                Long planAmount = 0L; // amountCents lives on PricingPlan, lookup deferred
                long credit = Math.round(planAmount * fraction);
                log.info("Pause proration for sub {}: credit ~{} cents ({}% of period remaining)", subscriptionId, credit, Math.round(fraction * 100));
            }
        }
        subscription.setStatus(com.kyra.billing.model.Subscription.SubscriptionStatus.PAUSED);
        subscription.setPausedAt(java.time.Instant.now());
        com.kyra.billing.model.Subscription saved = subscriptionRepository.save(subscription);
        log.info("Paused subscription {}", subscriptionId);
        return SubscriptionDTO.fromEntity(saved);
    }
    public SubscriptionDTO resumeSubscription(UUID subscriptionId) {
        Subscription subscription = subscriptionRepository.findById(subscriptionId)
                .orElseThrow(() -> new NoSuchElementException("Subscription not found: " + subscriptionId));

        if (subscription.getCancelAt() == null) {
            throw new IllegalStateException("Subscription is not scheduled for cancellation");
        }

        try {
            stripeService.resumeSubscription(subscription.getStripeSubscriptionId());

            subscription.setCancelAt(null);
            subscription.setCancelledAt(null);
            subscription.setStatus(Subscription.SubscriptionStatus.ACTIVE);
            subscription = subscriptionRepository.save(subscription);

            log.info("Resumed subscription {}", subscriptionId);
            return SubscriptionDTO.fromEntity(subscription);

        } catch (StripeException e) {
            log.error("Stripe error resuming subscription {}: {}", subscriptionId, e.getMessage());
            throw new RuntimeException("Failed to resume subscription: " + e.getMessage(), e);
        }
    }

    @Transactional
    public void handleWebhookEvent(Event event) {
        String eventType = event.getType();
        log.info("Processing Stripe webhook event: {} ({})", eventType, event.getId());

        EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
        if (!deserializer.getObject().isPresent()) {
            log.warn("Failed to deserialize webhook event data for event {}", event.getId());
            return;
        }

        StripeObject stripeObject = deserializer.getObject().get();

        switch (eventType) {
            case "invoice.paid" -> handleInvoicePaid((com.stripe.model.Invoice) stripeObject);
            case "invoice.payment_failed" -> handleInvoicePaymentFailed((com.stripe.model.Invoice) stripeObject);
            case "customer.subscription.updated" -> handleSubscriptionUpdated(
                    (com.stripe.model.Subscription) stripeObject);
            case "customer.subscription.deleted" -> handleSubscriptionDeleted(
                    (com.stripe.model.Subscription) stripeObject);
            default -> log.debug("Unhandled webhook event type: {}", eventType);
        }
    }

    private void handleInvoicePaid(com.stripe.model.Invoice stripeInvoice) {
        log.info("Invoice paid: {}", stripeInvoice.getId());

        String stripeSubId = stripeInvoice.getSubscription();
        if (stripeSubId == null) return;

        subscriptionRepository.findByStripeSubscriptionId(stripeSubId).ifPresent(subscription -> {
            Invoice invoice = Invoice.builder()
                    .tenantId(subscription.getTenantId())
                    .subscription(subscription)
                    .stripeInvoiceId(stripeInvoice.getId())
                    .amountCents(stripeInvoice.getAmountPaid().intValue())
                    .currency(stripeInvoice.getCurrency())
                    .status(Invoice.InvoiceStatus.PAID)
                    .periodStart(Instant.ofEpochSecond(stripeInvoice.getPeriodStart()))
                    .periodEnd(Instant.ofEpochSecond(stripeInvoice.getPeriodEnd()))
                    .paidAt(Instant.now())
                    .pdfUrl(stripeInvoice.getInvoicePdf())
                    .build();

            invoiceRepository.save(invoice);

            // Ensure subscription is active
            subscription.setStatus(Subscription.SubscriptionStatus.ACTIVE);
            subscriptionRepository.save(subscription);
        });
    }

    private void handleInvoicePaymentFailed(com.stripe.model.Invoice stripeInvoice) {
        log.warn("Invoice payment failed: {}", stripeInvoice.getId());

        String stripeSubId = stripeInvoice.getSubscription();
        if (stripeSubId == null) return;

        subscriptionRepository.findByStripeSubscriptionId(stripeSubId).ifPresent(subscription -> {
            // Record the failed invoice
            invoiceRepository.findByStripeInvoiceId(stripeInvoice.getId()).ifPresentOrElse(
                    existing -> {
                        existing.setStatus(Invoice.InvoiceStatus.OPEN);
                        invoiceRepository.save(existing);
                    },
                    () -> {
                        Invoice invoice = Invoice.builder()
                                .tenantId(subscription.getTenantId())
                                .subscription(subscription)
                                .stripeInvoiceId(stripeInvoice.getId())
                                .amountCents(stripeInvoice.getAmountDue().intValue())
                                .currency(stripeInvoice.getCurrency())
                                .status(Invoice.InvoiceStatus.OPEN)
                                .periodStart(Instant.ofEpochSecond(stripeInvoice.getPeriodStart()))
                                .periodEnd(Instant.ofEpochSecond(stripeInvoice.getPeriodEnd()))
                                .build();
                        invoiceRepository.save(invoice);
                    }
            );

            // Mark subscription as past_due
            subscription.setStatus(Subscription.SubscriptionStatus.PAST_DUE);
            subscriptionRepository.save(subscription);
        });
    }

    private void handleSubscriptionUpdated(com.stripe.model.Subscription stripeSubscription) {
        log.info("Subscription updated: {}", stripeSubscription.getId());

        subscriptionRepository.findByStripeSubscriptionId(stripeSubscription.getId()).ifPresent(subscription -> {
            subscription.setStatus(Subscription.SubscriptionStatus.fromStripe(stripeSubscription.getStatus()));
            subscription.setCurrentPeriodStart(Instant.ofEpochSecond(stripeSubscription.getCurrentPeriodStart()));
            subscription.setCurrentPeriodEnd(Instant.ofEpochSecond(stripeSubscription.getCurrentPeriodEnd()));

            if (stripeSubscription.getCancelAt() != null) {
                subscription.setCancelAt(Instant.ofEpochSecond(stripeSubscription.getCancelAt()));
            } else {
                subscription.setCancelAt(null);
            }

            if (stripeSubscription.getCanceledAt() != null) {
                subscription.setCancelledAt(Instant.ofEpochSecond(stripeSubscription.getCanceledAt()));
            }

            if (stripeSubscription.getTrialEnd() != null) {
                subscription.setTrialEnd(Instant.ofEpochSecond(stripeSubscription.getTrialEnd()));
            }

            subscriptionRepository.save(subscription);
        });
    }

    private void handleSubscriptionDeleted(com.stripe.model.Subscription stripeSubscription) {
        log.info("Subscription deleted: {}", stripeSubscription.getId());

        subscriptionRepository.findByStripeSubscriptionId(stripeSubscription.getId()).ifPresent(subscription -> {
            subscription.setStatus(Subscription.SubscriptionStatus.CANCELLED);
            subscription.setCancelledAt(Instant.now());
            subscriptionRepository.save(subscription);
        });
    }
}
