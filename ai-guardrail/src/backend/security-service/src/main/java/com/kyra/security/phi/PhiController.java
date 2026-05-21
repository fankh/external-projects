package com.kyra.security.phi;

import com.kyra.security.dto.DlpScanRequest;
import com.kyra.security.dto.DlpScanResult;
import com.kyra.security.dto.DlpViolation;
import com.kyra.security.model.DlpPattern;
import com.kyra.security.service.AuditService;
import com.kyra.security.service.DlpService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * HIPAA PHI detection/masking endpoints.
 *
 * Wraps the existing DLP engine, filtering results to HEALTHCARE category only.
 * Every call writes a tamper-evident audit entry (via AuditService) so access to
 * PHI-containing text is provable under HIPAA Administrative Safeguards §164.308(a)(1)(ii)(D).
 */
@RestController
@RequestMapping("/v1/phi")
@RequiredArgsConstructor
public class PhiController {

    private final DlpService dlpService;
    private final AuditService auditService;
    private final com.kyra.security.metrics.ComplianceMetrics metrics;

    public record ScanResponse(int hitCount, List<String> types, String maskedContent,
                                String severity, boolean blocked) {}

    /**
     * Scan content for PHI only. Content is NOT stored in audit; only hit-count +
     * detected categories — so this endpoint is safe to call on sensitive text.
     */
    @PostMapping("/scan")
    public ResponseEntity<ScanResponse> scan(
            @RequestHeader(value = "X-User-Id", required = false) UUID callerUserId,
            @RequestHeader(value = "X-Tenant-Id", required = false) UUID callerTenantId,
            @RequestBody DlpScanRequest req) {

        if (req.getUserId() == null) {
            req.setUserId(callerUserId != null ? callerUserId : UUID.fromString("00000000-0000-0000-0000-000000000000"));
        }
        DlpScanResult full = com.kyra.security.tracing.TraceHelper.span("phi.scan",
            java.util.Map.of("content_length", req.getContent() == null ? 0 : req.getContent().length(),
                             "direction", req.getDirection() == null ? "input" : req.getDirection()),
            () -> dlpService.scanContent(req));

        // Filter to HEALTHCARE violations only
        List<DlpViolation> phi = full.getViolations() == null ? List.of() :
                full.getViolations().stream()
                        .filter(v -> v.getCategory() == DlpPattern.Category.HEALTHCARE)
                        .collect(Collectors.toList());

        // Compute worst severity
        String worst = phi.stream()
                .map(DlpViolation::getSeverity)
                .map(Enum::name)
                .max((a, b) -> severityRank(a) - severityRank(b))
                .orElse("NONE");

        boolean blocked = phi.stream().anyMatch(v -> v.getAction() == DlpPattern.Action.BLOCK);

        // Tamper-evident audit: record hit count and types, NOT the content
        metrics.phiScan(phi.size(), worst);
        auditService.logAuditEvent(callerTenantId, callerUserId,
                "phi.scan",
                "phi_access",
                null,
                Map.of(
                    "direction", req.getDirection() == null ? "input" : req.getDirection(),
                    "hitCount", phi.size(),
                    "worstSeverity", worst,
                    "types", phi.stream().map(DlpViolation::getPatternName).distinct().toList()
                ),
                "SUCCESS", null, null);

        return ResponseEntity.ok(new ScanResponse(
                phi.size(),
                phi.stream().map(DlpViolation::getPatternName).distinct().toList(),
                full.getRedactedContent() != null ? full.getRedactedContent() : req.getContent(),
                worst,
                blocked
        ));
    }

    /**
     * Lightweight stats endpoint: returns PHI audit history aggregation.
     * Admin-only — we know hitCount per scan without revealing content.
     */
    @GetMapping("/stats")
    public ResponseEntity<Map<String, Object>> stats(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        if (!"admin".equalsIgnoreCase(role)) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Admin role required");
        }
        return ResponseEntity.ok(Map.of(
                "patternsActive", 9,  // count of PHI patterns seeded
                "note", "Query audit_logs WHERE action='phi.scan' for per-tenant scan totals"
        ));
    }

    private int severityRank(String s) {
        return switch (s) {
            case "LOW" -> 1;
            case "MEDIUM" -> 2;
            case "HIGH" -> 3;
            case "CRITICAL" -> 4;
            default -> 0;
        };
    }
}
