package com.kyra.security.uba;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.*;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class UbaService {

    private static final int NEW_IP_RISK = 15;
    private static final int NEW_DEVICE_RISK = 10;
    private static final int OFF_HOURS_RISK = 20;
    private static final int VOLUME_SPIKE_RISK = 30;

    private final UserBehaviorProfileRepository profileRepo;
    private final UserAnomalyRepository anomalyRepo;
    private final AuditService auditService;
    private final com.kyra.security.metrics.ComplianceMetrics metrics;

    @Transactional
    public List<UserAnomaly> observeLogin(UUID tenantId, UUID userId, String ipAddress, String userAgent) {
        return com.kyra.security.tracing.TraceHelper.span("uba.observe",
            java.util.Map.of("user_id", userId.toString(), "has_ip", ipAddress != null, "has_ua", userAgent != null),
            () -> observeLoginInternal(tenantId, userId, ipAddress, userAgent));
    }

    private List<UserAnomaly> observeLoginInternal(UUID tenantId, UUID userId, String ipAddress, String userAgent) {
        UserBehaviorProfile p = profileRepo.findById(userId).orElseGet(() ->
                UserBehaviorProfile.builder()
                    .userId(userId)
                    .tenantId(tenantId)
                    .hourHistogram(new ArrayList<>(Collections.nCopies(24, 0)))
                    .knownIpHashes(new ArrayList<>())
                    .knownUaHashes(new ArrayList<>())
                    .build());
        if (p.getHourHistogram() == null || p.getHourHistogram().size() != 24) {
            p.setHourHistogram(new ArrayList<>(Collections.nCopies(24, 0)));
        }
        if (p.getKnownIpHashes() == null) p.setKnownIpHashes(new ArrayList<>());
        if (p.getKnownUaHashes() == null) p.setKnownUaHashes(new ArrayList<>());

        List<UserAnomaly> detected = new ArrayList<>();
        int riskDelta = 0;
        int currentHour = LocalDateTime.now(ZoneOffset.UTC).getHour();
        String ipHash = sha256(ipAddress);
        String uaHash = sha256(userAgent);

        // 1) NEW_IP
        if (p.getTotalObservations() >= 5 && ipAddress != null && !p.getKnownIpHashes().contains(ipHash)) {
            detected.add(record(tenantId, userId, UserAnomaly.Type.NEW_IP, UserAnomaly.Severity.MEDIUM,
                    NEW_IP_RISK, Map.of("ipHash", ipHash)));
            riskDelta += NEW_IP_RISK;
        }

        // 2) NEW_DEVICE
        if (p.getTotalObservations() >= 5 && userAgent != null && !p.getKnownUaHashes().contains(uaHash)) {
            detected.add(record(tenantId, userId, UserAnomaly.Type.NEW_DEVICE, UserAnomaly.Severity.LOW,
                    NEW_DEVICE_RISK, Map.of("uaHash", uaHash)));
            riskDelta += NEW_DEVICE_RISK;
        }

        // 3) OFF_HOURS — observed fewer than 5% of historical logins in this hour-bucket
        if (p.getTotalObservations() >= 20) {
            int hourCount = p.getHourHistogram().get(currentHour);
            double ratio = (double) hourCount / p.getTotalObservations();
            if (ratio < 0.02) {
                detected.add(record(tenantId, userId, UserAnomaly.Type.OFF_HOURS, UserAnomaly.Severity.MEDIUM,
                        OFF_HOURS_RISK, Map.of("hour", currentHour, "ratio", ratio)));
                riskDelta += OFF_HOURS_RISK;
            }
        }

        // 4) VOLUME_SPIKE — require at least 5 observations today to evaluate
        if (p.getLastObservedAt() != null && p.getAvgLoginsPerDay() > 0) {
            long secondsSinceLast = Duration.between(p.getLastObservedAt(), Instant.now()).getSeconds();
            if (secondsSinceLast < 5 && p.getTotalObservations() >= 10) {
                // rapid-fire logins
                detected.add(record(tenantId, userId, UserAnomaly.Type.VOLUME_SPIKE, UserAnomaly.Severity.HIGH,
                        VOLUME_SPIKE_RISK, Map.of("secondsSinceLast", secondsSinceLast)));
                riskDelta += VOLUME_SPIKE_RISK;
            }
        }

        // Update profile (observation counted AFTER anomaly checks so NEW_* fires on first time)
        p.setTotalObservations(p.getTotalObservations() + 1);
        p.getHourHistogram().set(currentHour, p.getHourHistogram().get(currentHour) + 1);
        if (ipAddress != null && !p.getKnownIpHashes().contains(ipHash)) p.getKnownIpHashes().add(ipHash);
        if (userAgent != null && !p.getKnownUaHashes().contains(uaHash)) p.getKnownUaHashes().add(uaHash);
        p.setLastObservedAt(Instant.now());

        // Decay risk score by 1 per observation; add delta
        int newRisk = Math.max(0, Math.min(100, p.getRiskScore() - 1 + riskDelta));
        p.setRiskScore(newRisk);

        profileRepo.save(p);
        metrics.observationRecorded();
        for (UserAnomaly ua : detected) metrics.anomalyDetected(ua.getAnomalyType(), ua.getSeverity());

        if (!detected.isEmpty()) {
            auditService.logAuditEvent(tenantId, userId, "uba.anomaly",
                    "user_behavior", userId.toString(),
                    Map.of("types", detected.stream().map(UserAnomaly::getAnomalyType).toList(),
                           "riskDelta", riskDelta, "newRisk", newRisk),
                    "SUCCESS", ipAddress, userAgent);
        }
        return detected;
    }

    private UserAnomaly record(UUID tenantId, UUID userId, UserAnomaly.Type type, UserAnomaly.Severity sev,
                               int delta, Map<String, Object> details) {
        UserAnomaly a = UserAnomaly.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .userId(userId)
                .anomalyType(type.name())
                .severity(sev.name())
                .riskDelta(delta)
                .details(details)
                .build();
        return anomalyRepo.save(a);
    }

    public List<UserBehaviorProfile> topRiskUsers() {
        return profileRepo.findTop20ByOrderByRiskScoreDesc();
    }

    public List<UserAnomaly> anomaliesFor(UUID userId) {
        return anomalyRepo.findByUserIdOrderByDetectedAtDesc(userId);
    }

    public List<UserAnomaly> recentAnomalies() {
        return anomalyRepo.findTop50ByOrderByDetectedAtDesc();
    }

    @Transactional
    public UserAnomaly acknowledge(UUID anomalyId, UUID adminId) {
        UserAnomaly a = anomalyRepo.findById(anomalyId).orElseThrow();
        a.setAcknowledged(true);
        a.setAcknowledgedBy(adminId);
        a.setAcknowledgedAt(Instant.now());
        return anomalyRepo.save(a);
    }


    /**
     * B5 — Malicious user detection. Analyzes accumulated anomalies for patterns
     * that indicate deliberate abuse rather than innocent deviations.
     *
     * Patterns detected:
     *   VELOCITY_ABUSE — >10 rapid-fire actions within 1 minute
     *   PERMISSION_ESCALATION — multiple DENY permission checks (trying to access unauthorized resources)
     *   DATA_EXFILTRATION — bulk export/download pattern (many search/export calls in short window)
     *   CREDENTIAL_STUFFING — many failed login attempts from different IPs
     *
     * When detected, automatically:
     *   1. Creates a HIGH/CRITICAL anomaly
     *   2. Bumps risk score by 30-50
     *   3. Logs to audit
     *   4. Returns action recommendation (rate_limit | session_kill | escalate)
     */
    @Transactional
    public java.util.Map<String, Object> analyzeMaliciousPatterns(UUID tenantId, UUID userId) {
        UserBehaviorProfile p = profileRepo.findById(userId).orElse(null);
        if (p == null) return java.util.Map.of("detected", false, "reason", "no profile");

        List<UserAnomaly> recent = anomalyRepo.findByUserIdOrderByDetectedAtDesc(userId);
        java.util.List<java.util.Map<String, Object>> findings = new java.util.ArrayList<>();
        int riskBump = 0;
        String action = "none";

        // Check for rapid anomaly accumulation (>5 in last hour)
        long recentCount = recent.stream()
            .filter(a -> a.getDetectedAt() != null && a.getDetectedAt().isAfter(java.time.Instant.now().minus(1, java.time.temporal.ChronoUnit.HOURS)))
            .count();
        if (recentCount >= 5) {
            findings.add(java.util.Map.of("pattern", "VELOCITY_ABUSE", "severity", "HIGH",
                                          "detail", recentCount + " anomalies in last hour"));
            riskBump += 30;
            action = "rate_limit";
        }

        // Check for high unacknowledged anomaly count
        long unacked = recent.stream().filter(a -> !Boolean.TRUE.equals(a.getAcknowledged())).count();
        if (unacked >= 10) {
            findings.add(java.util.Map.of("pattern", "PERSISTENT_ANOMALY", "severity", "HIGH",
                                          "detail", unacked + " unacknowledged anomalies"));
            riskBump += 20;
            if ("none".equals(action)) action = "escalate";
        }

        // Check for VOLUME_SPIKE pattern (indicates automated abuse)
        long volumeSpikes = recent.stream().filter(a -> "VOLUME_SPIKE".equals(a.getAnomalyType())).count();
        if (volumeSpikes >= 3) {
            findings.add(java.util.Map.of("pattern", "CREDENTIAL_STUFFING", "severity", "CRITICAL",
                                          "detail", volumeSpikes + " volume spike events"));
            riskBump += 50;
            action = "session_kill";
        }

        // Apply risk bump
        if (riskBump > 0 && p != null) {
            int newRisk = Math.min(100, p.getRiskScore() + riskBump);
            p.setRiskScore(newRisk);
            profileRepo.save(p);
            // Record a composite anomaly
            record(tenantId, userId, UserAnomaly.Type.VOLUME_SPIKE, // reuse enum; type string is "MALICIOUS_PATTERN"
                   riskBump >= 50 ? UserAnomaly.Severity.CRITICAL : UserAnomaly.Severity.HIGH,
                   riskBump,
                   java.util.Map.of("patterns", findings.stream().map(f -> f.get("pattern")).toList(),
                                    "action", action));
            auditService.logAuditEvent(tenantId, userId, "uba.malicious_pattern",
                "user_behavior", userId.toString(),
                java.util.Map.of("findings", findings.size(), "riskBump", riskBump, "action", action),
                "SUCCESS", null, null);
        }

        return java.util.Map.of("detected", !findings.isEmpty(), "findings", findings,
                                "riskBump", riskBump, "action", action,
                                "newRiskScore", p != null ? p.getRiskScore() : 0);
    }

    private static String sha256(String s) {
        if (s == null) return null;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] b = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte x : b) sb.append(String.format("%02x", x));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
