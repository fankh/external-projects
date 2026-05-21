package com.kyra.security.controller;

import com.kyra.security.dto.DlpScanRequest;
import com.kyra.security.dto.DlpScanResult;
import com.kyra.security.model.DlpPattern;
import com.kyra.security.service.DlpService;
import com.kyra.security.service.ThreatDetectionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/security")
@RequiredArgsConstructor
@Slf4j
public class DlpController {

    private final DlpService dlpService;
    private final ThreatDetectionService threatDetectionService;

    @PostMapping("/scan")
    public ResponseEntity<DlpScanResult> scanContent(@Valid @RequestBody DlpScanRequest request) {
        log.info("DLP scan request for user {} direction={}", request.getUserId(), request.getDirection());

        // Run prompt injection detection alongside DLP scan
        var injectionResult = threatDetectionService.detectPromptInjection(request.getContent());
        DlpScanResult dlpResult = dlpService.scanContent(request);

        // If prompt injection detected, elevate the result
        if (injectionResult.isDetected()) {
            log.warn("Prompt injection detected for user {} confidence={} types={}",
                    request.getUserId(), injectionResult.getConfidence(), injectionResult.getInjectionType());

            if (injectionResult.getConfidence() >= 0.8) {
                return ResponseEntity.ok(DlpScanResult.builder()
                        .blocked(true)
                        .reason("Prompt injection detected: " + injectionResult.getInjectionType())
                        .violations(dlpResult.getViolations())
                        .riskScore(Math.max(dlpResult.getRiskScore(), 90))
                        .build());
            }
        }

        return ResponseEntity.ok(dlpResult);
    }

    @GetMapping("/patterns")
    public ResponseEntity<List<DlpPattern>> listPatterns() {
        return ResponseEntity.ok(dlpService.getAllPatterns());
    }

    @PostMapping("/patterns")
    public ResponseEntity<DlpPattern> createPattern(@Valid @RequestBody DlpPattern pattern) {
        log.info("Creating DLP pattern: {}", pattern.getName());
        DlpPattern created = dlpService.createPattern(pattern);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/patterns/{id}")
    public ResponseEntity<DlpPattern> updatePattern(@PathVariable UUID id,
                                                      @Valid @RequestBody DlpPattern pattern) {
        log.info("Updating DLP pattern: {}", id);
        DlpPattern updated = dlpService.updatePattern(id, pattern);
        return ResponseEntity.ok(updated);
    }
}
