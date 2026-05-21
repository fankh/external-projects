package com.kyra.security.service;

import com.kyra.security.dto.RiskAssessment;
import com.kyra.security.model.UserRiskScore;
import com.kyra.security.repository.SecurityEventRepository;
import com.kyra.security.repository.UserRiskScoreRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class RiskScoringService {

    private static final Map<String, Integer> FACTOR_WEIGHTS = Map.of(
            "dlpViolations", 25,
            "failedLogins", 15,
            "unusualPatterns", 20,
            "highVolume", 10,
            "offHours", 10,
            "sensitiveAccess", 20
    );

    private final UserRiskScoreRepository riskScoreRepository;
    private final SecurityEventRepository securityEventRepository;

    public RiskAssessment assessUserRisk(UUID userId) {
        Map<String, Object> factors = gatherFactors(userId);
        int score = calculateWeightedScore(factors);
        UserRiskScore.RiskLevel level = mapToLevel(score);
        List<String> recommendations = generateRecommendations(score, level, factors);

        // Persist or update risk score
        UserRiskScore riskScore = riskScoreRepository.findByUserId(userId)
                .orElse(UserRiskScore.builder()
                        .userId(userId)
                        .scoreHistory(new ArrayList<>())
                        .build());

        riskScore.setScore(score);
        riskScore.setRiskLevel(level);
        riskScore.setFactors(factors);
        riskScore.setLastCalculated(Instant.now());

        // Update rate-limiting and MFA flags
        riskScore.setRateLimited(score >= 60);
        riskScore.setMfaRequired(score >= 80);

        // Append to score history
        List<Map<String, Object>> history = riskScore.getScoreHistory();
        if (history == null) {
            history = new ArrayList<>();
        }
        Map<String, Object> historyEntry = new HashMap<>();
        historyEntry.put("score", score);
        historyEntry.put("level", level.name());
        historyEntry.put("timestamp", Instant.now().toString());
        history.add(historyEntry);
        // Keep last 100 entries
        if (history.size() > 100) {
            history = new ArrayList<>(history.subList(history.size() - 100, history.size()));
        }
        riskScore.setScoreHistory(history);

        riskScoreRepository.save(riskScore);

        List<Map<String, Object>> factorList = factors.entrySet().stream()
                .map(e -> {
                    Map<String, Object> f = new HashMap<>();
                    f.put("name", e.getKey());
                    f.put("value", e.getValue());
                    f.put("weight", FACTOR_WEIGHTS.getOrDefault(e.getKey(), 0));
                    return f;
                })
                .toList();

        return RiskAssessment.builder()
                .userId(userId)
                .score(score)
                .riskLevel(level)
                .factors(factorList)
                .recommendations(recommendations)
                .build();
    }

    public Optional<UserRiskScore> getUserRiskScore(UUID userId) {
        return riskScoreRepository.findByUserId(userId);
    }

    public List<Map<String, Object>> getRiskHistory(UUID userId) {
        return riskScoreRepository.findByUserId(userId)
                .map(UserRiskScore::getScoreHistory)
                .orElse(Collections.emptyList());
    }

    private Map<String, Object> gatherFactors(UUID userId) {
        Map<String, Object> factors = new HashMap<>();

        Instant last24h = Instant.now().minus(24, ChronoUnit.HOURS);
        Instant last7d = Instant.now().minus(7, ChronoUnit.DAYS);

        // DLP violations in last 24h
        long dlpViolations24h = securityEventRepository.countByUserIdAndCreatedAtAfter(userId, last24h);
        factors.put("dlpViolations", normalizeCount(dlpViolations24h, 10));

        // Total events in last 7 days (proxy for failed logins and unusual patterns)
        long totalEvents7d = securityEventRepository.countByUserIdAndCreatedAtAfter(userId, last7d);
        factors.put("failedLogins", normalizeCount(totalEvents7d / 3, 5));
        factors.put("unusualPatterns", normalizeCount(totalEvents7d / 2, 8));

        // High volume check
        long recentEvents = securityEventRepository.countByUserIdAndCreatedAtAfter(userId,
                Instant.now().minus(1, ChronoUnit.HOURS));
        factors.put("highVolume", normalizeCount(recentEvents, 20));

        // Off-hours (simplified: consider anything as potential)
        factors.put("offHours", 0.0);

        // Sensitive access
        factors.put("sensitiveAccess", normalizeCount(dlpViolations24h, 5));

        return factors;
    }

    private double normalizeCount(long count, long threshold) {
        return Math.min(1.0, (double) count / threshold);
    }

    private int calculateWeightedScore(Map<String, Object> factors) {
        double totalScore = 0;
        for (Map.Entry<String, Integer> weightEntry : FACTOR_WEIGHTS.entrySet()) {
            Object factorValue = factors.get(weightEntry.getKey());
            if (factorValue instanceof Number number) {
                totalScore += number.doubleValue() * weightEntry.getValue();
            }
        }
        return Math.min(100, (int) Math.round(totalScore));
    }

    private UserRiskScore.RiskLevel mapToLevel(int score) {
        if (score < 30) return UserRiskScore.RiskLevel.LOW;
        if (score < 60) return UserRiskScore.RiskLevel.MEDIUM;
        if (score < 80) return UserRiskScore.RiskLevel.HIGH;
        return UserRiskScore.RiskLevel.CRITICAL;
    }

    private List<String> generateRecommendations(int score, UserRiskScore.RiskLevel level,
                                                   Map<String, Object> factors) {
        List<String> recommendations = new ArrayList<>();

        if (level == UserRiskScore.RiskLevel.CRITICAL) {
            recommendations.add("Immediately review user activity and consider temporary suspension");
            recommendations.add("Enable mandatory MFA for this account");
            recommendations.add("Notify security team for manual review");
        } else if (level == UserRiskScore.RiskLevel.HIGH) {
            recommendations.add("Enable rate limiting for this user");
            recommendations.add("Require MFA for sensitive operations");
            recommendations.add("Increase monitoring frequency");
        } else if (level == UserRiskScore.RiskLevel.MEDIUM) {
            recommendations.add("Monitor user activity more closely");
            recommendations.add("Consider enabling additional DLP patterns");
        }

        Object dlpValue = factors.get("dlpViolations");
        if (dlpValue instanceof Number n && n.doubleValue() > 0.5) {
            recommendations.add("High DLP violation rate detected - review data access policies");
        }

        Object volumeValue = factors.get("highVolume");
        if (volumeValue instanceof Number n && n.doubleValue() > 0.5) {
            recommendations.add("Unusual request volume detected - verify automated access");
        }

        return recommendations;
    }
}
