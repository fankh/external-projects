package com.kyra.security.controller;

import com.kyra.security.dto.RiskAssessment;
import com.kyra.security.service.AuditService;
import com.kyra.security.service.RiskScoringService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/security/risk")
@RequiredArgsConstructor
@Slf4j
public class RiskController {

    private final RiskScoringService riskScoringService;
    private final AuditService auditService;

    @GetMapping("/{userId}")
    public ResponseEntity<RiskAssessment> getUserRisk(@PathVariable UUID userId) {
        log.info("Risk assessment requested for user {}", userId);
        RiskAssessment assessment = riskScoringService.assessUserRisk(userId);
        return ResponseEntity.ok(assessment);
    }

    @GetMapping("/{userId}/history")
    public ResponseEntity<List<Map<String, Object>>> getRiskHistory(@PathVariable UUID userId) {
        List<Map<String, Object>> history = riskScoringService.getRiskHistory(userId);
        return ResponseEntity.ok(history);
    }

    @GetMapping("/dashboard")
    public ResponseEntity<Map<String, Object>> getSecurityDashboard() {
        Map<String, Object> dashboard = auditService.getSecurityDashboard();
        return ResponseEntity.ok(dashboard);
    }
}
