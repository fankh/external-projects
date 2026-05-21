package com.kyra.analytics.controller;

import com.kyra.analytics.dto.QuotaCheckResult;
import com.kyra.analytics.dto.TrackUsageRequest;
import com.kyra.analytics.dto.UsageSummaryDTO;
import com.kyra.analytics.service.QuotaService;
import com.kyra.analytics.service.UsageTrackingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/analytics")
@RequiredArgsConstructor
@Slf4j
public class UsageController {

    private final UsageTrackingService usageTrackingService;
    private final QuotaService quotaService;

    @GetMapping("/usage/{userId}")
    public ResponseEntity<UsageSummaryDTO> getUserUsage(
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "day") String period) {
        log.info("Get usage summary for user {} period={}", userId, period);
        UsageSummaryDTO summary = usageTrackingService.getUserSummary(userId, period);
        return ResponseEntity.ok(summary);
    }

    @GetMapping("/usage/{userId}/quota")
    public ResponseEntity<QuotaCheckResult> checkQuota(@PathVariable UUID userId) {
        log.info("Check quota for user {}", userId);
        QuotaCheckResult result = quotaService.checkQuota(userId);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/track")
    public ResponseEntity<Map<String, String>> trackUsage(@Valid @RequestBody TrackUsageRequest request) {
        log.info("Track usage for user {} queries={}", request.getUserId(), request.getQueryCount());

        // Check quota before tracking
        QuotaCheckResult quotaCheck = quotaService.checkQuota(request.getUserId());
        if (!quotaCheck.isAllowed()) {
            log.warn("Quota exceeded for user {}", request.getUserId());
            return ResponseEntity.status(429).body(Map.of(
                    "status", "rejected",
                    "reason", "Quota exceeded",
                    "resetAt", quotaCheck.getResetAt().toString()
            ));
        }

        usageTrackingService.trackUsage(request);
        return ResponseEntity.ok(Map.of("status", "tracked"));
    }

    @GetMapping("/department/{deptId}")
    public ResponseEntity<Map<String, Object>> getDepartmentUsage(
            @PathVariable UUID deptId,
            @RequestParam(defaultValue = "month") String period) {
        log.info("Get department usage for dept {} period={}", deptId, period);
        Map<String, Object> result = usageTrackingService.getDepartmentAggregation(deptId, period);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/overview")
    public ResponseEntity<Map<String, Object>> getSystemOverview(
            @RequestParam(defaultValue = "month") String period) {
        log.info("Get system overview period={}", period);
        Map<String, Object> result = usageTrackingService.getSystemOverview(period);
        return ResponseEntity.ok(result);
    }
}
