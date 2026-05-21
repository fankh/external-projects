package com.kyra.security.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

/**
 * Single injection point for compliance-flow metrics. Every counter has a short
 * stable name so Prometheus queries + alert rules stay simple.
 */
@Component
public class ComplianceMetrics {

    private final MeterRegistry registry;

    public ComplianceMetrics(MeterRegistry registry) {
        this.registry = registry;
    }

    /* ---------- PHI ---------- */
    public void phiScan(int hitCount, String worstSeverity) {
        registry.counter("kyra_phi_scans_total", "severity", worstSeverity).increment();
        if (hitCount > 0) {
            registry.counter("kyra_phi_hits_total", "severity", worstSeverity).increment(hitCount);
        }
    }

    /* ---------- Privacy / GDPR DSR ---------- */
    public void privacyRequest(String type) {
        registry.counter("kyra_privacy_requests_total", "type", type).increment();
    }
    public void privacyStatusChange(String type, String status) {
        registry.counter("kyra_privacy_status_total", "type", type, "status", status).increment();
    }
    public Timer.Sample privacyFulfillStart() { return Timer.start(registry); }
    public void privacyFulfillEnd(Timer.Sample s, String type, String result) {
        s.stop(Timer.builder("kyra_privacy_fulfill_duration")
                .tags("type", type, "result", result)
                .publishPercentiles(0.5, 0.95, 0.99)
                .register(registry));
    }

    /* ---------- Breach ---------- */
    public void breachReported(String severity, String category) {
        registry.counter("kyra_breach_reported_total", "severity", severity, "category", category).increment();
    }
    public void breachAuthorityNotified(boolean onTime) {
        registry.counter("kyra_breach_notifications_total", "kind", "authority", "on_time", Boolean.toString(onTime)).increment();
    }

    /* ---------- UBA ---------- */
    public void anomalyDetected(String type, String severity) {
        registry.counter("kyra_uba_anomalies_total", "type", type, "severity", severity).increment();
    }
    public void observationRecorded() {
        registry.counter("kyra_uba_observations_total").increment();
    }

    /* ---------- Permissions ---------- */
    public void permissionDecision(String resourceType, String action, boolean allowed) {
        registry.counter("kyra_permission_decisions_total",
                "resource_type", resourceType, "action", action,
                "decision", allowed ? "allow" : "deny").increment();
    }

    /* ---------- Audit ---------- */
    public void auditChainWritten() {
        registry.counter("kyra_audit_entries_total").increment();
    }
    public void legalHoldChange(boolean activated) {
        registry.counter("kyra_audit_legal_hold_total", "op", activated ? "activate" : "release").increment();
    }
}
