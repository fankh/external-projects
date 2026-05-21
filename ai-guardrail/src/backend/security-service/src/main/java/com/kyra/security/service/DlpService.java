package com.kyra.security.service;

import com.kyra.security.dto.DlpScanRequest;
import com.kyra.security.dto.DlpScanResult;
import com.kyra.security.dto.DlpViolation;
import com.kyra.security.engine.PatternMatcher;
import com.kyra.security.model.DlpPattern;
import com.kyra.security.model.SecurityEvent;
import com.kyra.security.repository.DlpPatternRepository;
import com.kyra.security.repository.SecurityEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class DlpService {

    private static final String PATTERNS_CACHE_KEY = "dlp:patterns:active";
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private static final Map<DlpPattern.Severity, Integer> SEVERITY_WEIGHTS = Map.of(
            DlpPattern.Severity.LOW, 10,
            DlpPattern.Severity.MEDIUM, 30,
            DlpPattern.Severity.HIGH, 60,
            DlpPattern.Severity.CRITICAL, 100
    );

    private static final Map<DlpPattern.Category, Double> CATEGORY_MULTIPLIERS = Map.of(
            DlpPattern.Category.PII, 1.2,
            DlpPattern.Category.FINANCIAL, 1.5,
            DlpPattern.Category.CREDENTIALS, 2.0,
            DlpPattern.Category.HEALTHCARE, 1.3,
            DlpPattern.Category.INTELLECTUAL_PROPERTY, 1.4,
            DlpPattern.Category.CUSTOM, 1.0
    );

    private final DlpPatternRepository patternRepository;
    private final SecurityEventRepository securityEventRepository;
    private final PatternMatcher patternMatcher;
    private final RedisTemplate<String, Object> redisTemplate;

    public DlpScanResult scanContent(DlpScanRequest request) {
        log.debug("Scanning content for user {} direction={}", request.getUserId(), request.getDirection());

        List<DlpPattern> activePatterns = getActivePatterns();
        List<PatternMatcher.MatchResult> allMatches = new ArrayList<>();

        for (DlpPattern pattern : activePatterns) {
            List<PatternMatcher.MatchResult> matches = patternMatcher.match(request.getContent(), pattern);
            allMatches.addAll(matches);
        }

        if (allMatches.isEmpty()) {
            return DlpScanResult.builder()
                    .blocked(false)
                    .violations(Collections.emptyList())
                    .riskScore(0)
                    .build();
        }

        List<DlpViolation> violations = allMatches.stream()
                .map(m -> DlpViolation.builder()
                        .patternId(m.patternId())
                        .patternName(m.patternName())
                        .category(m.category())
                        .severity(m.severity())
                        .matchedText(m.matchedText())
                        .action(m.action())
                        .build())
                .collect(Collectors.toList());

        int riskScore = calculateRiskScore(allMatches);
        boolean blocked = allMatches.stream().anyMatch(m -> m.action() == DlpPattern.Action.BLOCK);
        boolean needsRedaction = allMatches.stream().anyMatch(m -> m.action() == DlpPattern.Action.REDACT);

        String redactedContent = needsRedaction ? redactContent(request.getContent(), allMatches) : null;
        String reason = blocked ? buildBlockReason(violations) : null;

        // Log security event for each violation
        for (PatternMatcher.MatchResult match : allMatches) {
            SecurityEvent event = SecurityEvent.builder()
                    .userId(request.getUserId())
                    .eventType(SecurityEvent.EventType.DLP_VIOLATION)
                    .severity(match.severity())
                    .triggerContent(truncate(match.matchedText(), 500))
                    .detectionMethod("pattern:" + match.patternName())
                    .confidenceScore(1.0)
                    .actionTaken(match.action().name())
                    .conversationId(request.getConversationId())
                    .metadata(request.getMetadata())
                    .build();
            securityEventRepository.save(event);
        }

        return DlpScanResult.builder()
                .blocked(blocked)
                .reason(reason)
                .redactedContent(redactedContent)
                .violations(violations)
                .riskScore(riskScore)
                .build();
    }

    public String redactContent(String content, List<PatternMatcher.MatchResult> matches) {
        // Sort matches by position descending so replacements don't shift indices
        List<PatternMatcher.MatchResult> sorted = matches.stream()
                .filter(m -> m.action() == DlpPattern.Action.REDACT || m.action() == DlpPattern.Action.BLOCK)
                .sorted(Comparator.comparingInt(PatternMatcher.MatchResult::start).reversed())
                .toList();

        StringBuilder sb = new StringBuilder(content);
        for (PatternMatcher.MatchResult match : sorted) {
            String replacement = "[REDACTED:" + match.category().name() + "]";
            sb.replace(match.start(), match.end(), replacement);
        }
        return sb.toString();
    }

    public int calculateRiskScore(List<PatternMatcher.MatchResult> matches) {
        double totalScore = 0;
        for (PatternMatcher.MatchResult match : matches) {
            int weight = SEVERITY_WEIGHTS.getOrDefault(match.severity(), 10);
            double multiplier = CATEGORY_MULTIPLIERS.getOrDefault(match.category(), 1.0);
            totalScore += weight * multiplier;
        }
        return Math.min(100, (int) totalScore);
    }

    public List<DlpPattern> getActivePatterns() {
        try {
            @SuppressWarnings("unchecked")
            List<DlpPattern> cached = (List<DlpPattern>) redisTemplate.opsForValue().get(PATTERNS_CACHE_KEY);
            if (cached != null && !cached.isEmpty()) {
                return cached;
            }
        } catch (Exception e) {
            log.warn("Redis cache read failed, falling back to database: {}", e.getMessage());
        }

        List<DlpPattern> patterns = patternRepository.findByIsActiveTrue();

        try {
            redisTemplate.opsForValue().set(PATTERNS_CACHE_KEY, patterns, CACHE_TTL);
        } catch (Exception e) {
            log.warn("Redis cache write failed: {}", e.getMessage());
        }

        return patterns;
    }

    public DlpPattern createPattern(DlpPattern pattern) {
        DlpPattern saved = patternRepository.save(pattern);
        invalidateCache();
        return saved;
    }

    public DlpPattern updatePattern(UUID id, DlpPattern updated) {
        DlpPattern existing = patternRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Pattern not found: " + id));

        existing.setName(updated.getName());
        existing.setDescription(updated.getDescription());
        existing.setCategory(updated.getCategory());
        existing.setPatternType(updated.getPatternType());
        existing.setPattern(updated.getPattern());
        existing.setSeverity(updated.getSeverity());
        existing.setAction(updated.getAction());
        existing.setIsActive(updated.getIsActive());

        DlpPattern saved = patternRepository.save(existing);
        patternMatcher.invalidatePattern(id);
        invalidateCache();
        return saved;
    }

    public List<DlpPattern> getAllPatterns() {
        return patternRepository.findAll();
    }

    private void invalidateCache() {
        try {
            redisTemplate.delete(PATTERNS_CACHE_KEY);
        } catch (Exception e) {
            log.warn("Failed to invalidate cache: {}", e.getMessage());
        }
        patternMatcher.invalidateAll();
    }

    private String buildBlockReason(List<DlpViolation> violations) {
        return violations.stream()
                .filter(v -> v.getAction() == DlpPattern.Action.BLOCK)
                .map(v -> v.getCategory() + ": " + v.getPatternName())
                .collect(Collectors.joining("; ", "Blocked due to: ", ""));
    }

    private String truncate(String text, int maxLen) {
        if (text == null) return null;
        return text.length() > maxLen ? text.substring(0, maxLen) + "..." : text;
    }
}
