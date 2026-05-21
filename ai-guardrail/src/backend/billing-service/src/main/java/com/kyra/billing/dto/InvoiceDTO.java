package com.kyra.billing.dto;

import com.kyra.billing.model.Invoice;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class InvoiceDTO {

    private UUID id;
    private UUID tenantId;
    private UUID subscriptionId;
    private String stripeInvoiceId;
    private Integer amountCents;
    private String currency;
    private String status;
    private Instant periodStart;
    private Instant periodEnd;
    private Instant paidAt;
    private String pdfUrl;
    private Instant createdAt;

    public static InvoiceDTO fromEntity(Invoice invoice) {
        return InvoiceDTO.builder()
                .id(invoice.getId())
                .tenantId(invoice.getTenantId())
                .subscriptionId(invoice.getSubscription() != null ? invoice.getSubscription().getId() : null)
                .stripeInvoiceId(invoice.getStripeInvoiceId())
                .amountCents(invoice.getAmountCents())
                .currency(invoice.getCurrency())
                .status(invoice.getStatus().name().toLowerCase())
                .periodStart(invoice.getPeriodStart())
                .periodEnd(invoice.getPeriodEnd())
                .paidAt(invoice.getPaidAt())
                .pdfUrl(invoice.getPdfUrl())
                .createdAt(invoice.getCreatedAt())
                .build();
    }
}
