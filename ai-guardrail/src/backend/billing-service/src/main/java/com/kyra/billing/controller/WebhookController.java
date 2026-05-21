package com.kyra.billing.controller;

import com.kyra.billing.service.StripeService;
import com.kyra.billing.service.SubscriptionService;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.model.Event;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/billing/webhooks")
@RequiredArgsConstructor
@Slf4j
public class WebhookController {

    private final StripeService stripeService;
    private final SubscriptionService subscriptionService;

    @PostMapping("/stripe")
    public ResponseEntity<Map<String, String>> handleStripeWebhook(
            @RequestBody String payload,
            @RequestHeader("Stripe-Signature") String sigHeader) {

        Event event;
        try {
            event = stripeService.verifyWebhookSignature(payload, sigHeader);
        } catch (SignatureVerificationException e) {
            log.warn("Invalid Stripe webhook signature: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("error", "Invalid signature"));
        }

        try {
            subscriptionService.handleWebhookEvent(event);
            return ResponseEntity.ok(Map.of("status", "processed"));
        } catch (Exception e) {
            log.error("Error processing webhook event {}: {}", event.getId(), e.getMessage(), e);
            // Return 200 to prevent Stripe retries for processing errors
            // (we log the error and can investigate)
            return ResponseEntity.ok(Map.of("status", "error", "message", e.getMessage()));
        }
    }
}
