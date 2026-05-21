package com.kyra.billing.controller;

import com.kyra.billing.dto.InvoiceDTO;
import com.kyra.billing.model.Invoice;
import com.kyra.billing.repository.InvoiceRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/billing/invoices")
@RequiredArgsConstructor
@Slf4j
public class InvoiceController {

    private final InvoiceRepository invoiceRepository;

    @GetMapping("/{tenantId}")
    public ResponseEntity<List<InvoiceDTO>> listInvoices(@PathVariable UUID tenantId) {
        log.info("Listing invoices for tenant {}", tenantId);
        List<InvoiceDTO> invoices = invoiceRepository.findByTenantIdOrderByCreatedAtDesc(tenantId)
                .stream()
                .map(InvoiceDTO::fromEntity)
                .toList();
        return ResponseEntity.ok(invoices);
    }

    @GetMapping("/{id}/download")
    public ResponseEntity<Map<String, String>> downloadInvoice(@PathVariable UUID id) {
        log.info("Getting PDF URL for invoice {}", id);
        Invoice invoice = invoiceRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Invoice not found: " + id));

        if (invoice.getPdfUrl() == null || invoice.getPdfUrl().isBlank()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(Map.of("pdfUrl", invoice.getPdfUrl()));
    }
}
