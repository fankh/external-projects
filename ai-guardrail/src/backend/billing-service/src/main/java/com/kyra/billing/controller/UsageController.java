package com.kyra.billing.controller;

import com.kyra.billing.dto.UsageSummaryDTO;
import com.kyra.billing.service.MeteringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/billing/usage")
@RequiredArgsConstructor
@Slf4j
public class UsageController {

    private final MeteringService meteringService;

    @PostMapping("/record")
    public ResponseEntity<Map<String, Object>> recordUsage(@RequestBody Map<String, Object> body) {
        UUID tenantId = UUID.fromString((String) body.get("tenantId"));
        String metric = (String) body.get("metric");
        long quantity = ((Number) body.get("quantity")).longValue();

        log.info("Recording usage for tenant {} metric={} quantity={}", tenantId, metric, quantity);
        var record = meteringService.recordUsage(tenantId, metric, quantity);

        return ResponseEntity.ok(Map.of(
                "id", record.getId().toString(),
                "tenantId", record.getTenantId().toString(),
                "metric", record.getMetric(),
                "quantity", record.getQuantity(),
                "recordedAt", record.getRecordedAt().toString()
        ));
    }

    @GetMapping("/{tenantId}")
    public ResponseEntity<UsageSummaryDTO> getUsageSummary(@PathVariable UUID tenantId) {
        log.info("Getting usage summary for tenant {}", tenantId);
        UsageSummaryDTO summary = meteringService.getUsageSummary(tenantId);
        return ResponseEntity.ok(summary);
    }
}
