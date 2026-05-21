package com.kyra.billing.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Payment method management. In production, delegates to Stripe's
 * PaymentMethod API. In dev (placeholder keys), returns mock data.
 */
@RestController
@RequestMapping("/v1/billing/payment-methods")
@RequiredArgsConstructor
@Slf4j
public class PaymentMethodController {

    @GetMapping("/{tenantId}")
    public ResponseEntity<List<Map<String, Object>>> list(@PathVariable UUID tenantId) {
        log.info("Listing payment methods for tenant {}", tenantId);
        // Mock — real impl calls stripe.paymentMethods.list(customer)
        return ResponseEntity.ok(List.of(
            Map.of("id", "pm_mock_visa", "type", "card", "brand", "visa",
                   "last4", "4242", "expMonth", 12, "expYear", 2027, "isDefault", true),
            Map.of("id", "pm_mock_mc", "type", "card", "brand", "mastercard",
                   "last4", "5555", "expMonth", 6, "expYear", 2026, "isDefault", false)
        ));
    }

    public record AttachReq(String paymentMethodToken) {}

    @PostMapping("/{tenantId}")
    public ResponseEntity<Map<String, Object>> attach(
            @PathVariable UUID tenantId, @RequestBody AttachReq r) {
        log.info("Attaching payment method {} to tenant {}", r.paymentMethodToken(), tenantId);
        // Mock — real impl calls stripe.paymentMethods.attach
        return ResponseEntity.ok(Map.of(
            "id", r.paymentMethodToken(),
            "type", "card",
            "brand", "unknown",
            "last4", "0000",
            "attached", true
        ));
    }

    @DeleteMapping("/{tenantId}/{pmId}")
    public ResponseEntity<Map<String, Object>> detach(
            @PathVariable UUID tenantId, @PathVariable String pmId) {
        log.info("Detaching payment method {} from tenant {}", pmId, tenantId);
        // Mock — real impl calls stripe.paymentMethods.detach
        return ResponseEntity.ok(Map.of("id", pmId, "detached", true));
    }

    @PostMapping("/{tenantId}/{pmId}/default")
    public ResponseEntity<Map<String, Object>> setDefault(
            @PathVariable UUID tenantId, @PathVariable String pmId) {
        log.info("Setting {} as default for tenant {}", pmId, tenantId);
        // Mock — real impl updates customer's default_payment_method
        return ResponseEntity.ok(Map.of("id", pmId, "isDefault", true));
    }
}
