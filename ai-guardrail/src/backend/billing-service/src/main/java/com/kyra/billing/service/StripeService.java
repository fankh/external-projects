package com.kyra.billing.service;

import com.kyra.billing.config.StripeConfig;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.*;
import com.stripe.net.Webhook;
import com.stripe.param.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class StripeService {

    private final StripeConfig stripeConfig;

    public Customer createCustomer(String email, String name, String tenantId) throws StripeException {
        CustomerCreateParams params = CustomerCreateParams.builder()
                .setEmail(email)
                .setName(name)
                .putMetadata("tenantId", tenantId)
                .build();

        Customer customer = Customer.create(params);
        log.info("Created Stripe customer {} for tenant {}", customer.getId(), tenantId);
        return customer;
    }

    public Customer attachPaymentMethod(String customerId, String paymentMethodId) throws StripeException {
        PaymentMethod paymentMethod = PaymentMethod.retrieve(paymentMethodId);

        PaymentMethodAttachParams attachParams = PaymentMethodAttachParams.builder()
                .setCustomer(customerId)
                .build();
        paymentMethod.attach(attachParams);

        CustomerUpdateParams updateParams = CustomerUpdateParams.builder()
                .setInvoiceSettings(CustomerUpdateParams.InvoiceSettings.builder()
                        .setDefaultPaymentMethod(paymentMethodId)
                        .build())
                .build();

        Customer customer = Customer.retrieve(customerId);
        customer.update(updateParams);
        log.info("Attached payment method {} to customer {}", paymentMethodId, customerId);
        return customer;
    }

    public Subscription createSubscription(String customerId, String stripePriceId, Long trialDays)
            throws StripeException {
        SubscriptionCreateParams.Builder builder = SubscriptionCreateParams.builder()
                .setCustomer(customerId)
                .addItem(SubscriptionCreateParams.Item.builder()
                        .setPrice(stripePriceId)
                        .build())
                .setPaymentBehavior(SubscriptionCreateParams.PaymentBehavior.DEFAULT_INCOMPLETE)
                .addExpand("latest_invoice.payment_intent");

        if (trialDays != null && trialDays > 0) {
            builder.setTrialPeriodDays(trialDays);
        }

        Subscription subscription = Subscription.create(builder.build());
        log.info("Created Stripe subscription {} for customer {}", subscription.getId(), customerId);
        return subscription;
    }

    public Subscription updateSubscription(String subscriptionId, String newStripePriceId) throws StripeException {
        Subscription subscription = Subscription.retrieve(subscriptionId);

        SubscriptionUpdateParams params = SubscriptionUpdateParams.builder()
                .addItem(SubscriptionUpdateParams.Item.builder()
                        .setId(subscription.getItems().getData().get(0).getId())
                        .setPrice(newStripePriceId)
                        .build())
                .setProrationBehavior(SubscriptionUpdateParams.ProrationBehavior.CREATE_PRORATIONS)
                .build();

        Subscription updated = subscription.update(params);
        log.info("Updated Stripe subscription {} to price {}", subscriptionId, newStripePriceId);
        return updated;
    }

    public Subscription cancelSubscription(String subscriptionId, boolean atPeriodEnd) throws StripeException {
        Subscription subscription = Subscription.retrieve(subscriptionId);

        if (atPeriodEnd) {
            SubscriptionUpdateParams params = SubscriptionUpdateParams.builder()
                    .setCancelAtPeriodEnd(true)
                    .build();
            Subscription updated = subscription.update(params);
            log.info("Scheduled Stripe subscription {} for cancellation at period end", subscriptionId);
            return updated;
        } else {
            Subscription cancelled = subscription.cancel();
            log.info("Immediately cancelled Stripe subscription {}", subscriptionId);
            return cancelled;
        }
    }

    public Subscription resumeSubscription(String subscriptionId) throws StripeException {
        Subscription subscription = Subscription.retrieve(subscriptionId);

        SubscriptionUpdateParams params = SubscriptionUpdateParams.builder()
                .setCancelAtPeriodEnd(false)
                .build();

        Subscription resumed = subscription.update(params);
        log.info("Resumed Stripe subscription {}", subscriptionId);
        return resumed;
    }

    public UsageRecord createUsageRecord(String subscriptionItemId, long quantity, long timestamp)
            throws StripeException {
        UsageRecordCreateOnSubscriptionItemParams params = UsageRecordCreateOnSubscriptionItemParams.builder()
                .setQuantity(quantity)
                .setTimestamp(timestamp)
                .setAction(UsageRecordCreateOnSubscriptionItemParams.Action.INCREMENT)
                .build();

        UsageRecord record = UsageRecord.createOnSubscriptionItem(subscriptionItemId, params);
        log.info("Created Stripe usage record on item {} quantity={}", subscriptionItemId, quantity);
        return record;
    }

    public Event verifyWebhookSignature(String payload, String sigHeader) throws SignatureVerificationException {
        return Webhook.constructEvent(payload, sigHeader, stripeConfig.getWebhookSecret());
    }

    public Customer retrieveCustomer(String customerId) throws StripeException {
        return Customer.retrieve(customerId);
    }

    public com.stripe.model.Invoice retrieveInvoice(String invoiceId) throws StripeException {
        return com.stripe.model.Invoice.retrieve(invoiceId);
    }
}
