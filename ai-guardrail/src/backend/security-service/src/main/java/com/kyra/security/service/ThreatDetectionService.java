package com.kyra.security.service;

import lombok.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
@Slf4j
public class ThreatDetectionService {

    private static final Map<String, Pattern> INJECTION_PATTERNS = new ConcurrentHashMap<>();

    static {
        Map<String, String> rawPatterns = Map.ofEntries(
                Map.entry("IGNORE_PREVIOUS", "(?i)(ignore|disregard|forget|override)\\s+(all\\s+)?(previous|prior|above|earlier)\\s+(instructions|prompts|rules|context)"),
                Map.entry("PRETEND_ROLE", "(?i)(pretend|act|behave|imagine)\\s+(you\\s+are|you're|to\\s+be|as\\s+if)\\s+"),
                Map.entry("DAN_MODE", "(?i)(DAN|do\\s+anything\\s+now|jailbreak|unlocked\\s+mode|developer\\s+mode)"),
                Map.entry("SYSTEM_PROMPT_EXTRACTION", "(?i)(show|reveal|display|print|output|repeat|tell\\s+me)\\s+(your|the)\\s+(system\\s+prompt|instructions|initial\\s+prompt|hidden\\s+prompt|original\\s+prompt)"),
                Map.entry("ROLE_ESCAPE", "(?i)(you\\s+are\\s+now|new\\s+role|switch\\s+to|change\\s+your\\s+role|from\\s+now\\s+on\\s+you)"),
                Map.entry("ENCODING_ATTACK", "(?i)(base64|rot13|hex|encode|decode|translate\\s+from)\\s+(the\\s+following|this)"),
                Map.entry("DELIMITER_INJECTION", "(?i)(```|<\\|im_start\\|>|<\\|im_end\\|>|\\[INST\\]|\\[/INST\\]|<<SYS>>|<</SYS>>)"),
                Map.entry("CONTEXT_MANIPULATION", "(?i)(the\\s+above\\s+(is|was)\\s+(a\\s+test|fake|not\\s+real)|new\\s+conversation\\s+starts|end\\s+of\\s+(system|initial)\\s+prompt)")
        );

        rawPatterns.forEach((name, regex) -> {
            try {
                INJECTION_PATTERNS.put(name, Pattern.compile(regex));
            } catch (Exception e) {
                log.error("Failed to compile injection pattern '{}': {}", name, e.getMessage());
            }
        });
    }

    public InjectionDetectionResult detectPromptInjection(String content) {
        List<String> matchedPatterns = new ArrayList<>();
        List<String> injectionTypes = new ArrayList<>();

        for (Map.Entry<String, Pattern> entry : INJECTION_PATTERNS.entrySet()) {
            if (entry.getValue().matcher(content).find()) {
                matchedPatterns.add(entry.getKey());
                injectionTypes.add(entry.getKey());
            }
        }

        boolean detected = !matchedPatterns.isEmpty();
        double confidence = detected ? calculateConfidence(matchedPatterns, content) : 0.0;

        return InjectionDetectionResult.builder()
                .detected(detected)
                .confidence(confidence)
                .injectionType(detected ? String.join(",", injectionTypes) : null)
                .matchedPatterns(matchedPatterns)
                .build();
    }

    private double calculateConfidence(List<String> matchedPatterns, String content) {
        double base = Math.min(0.5 + (matchedPatterns.size() * 0.15), 1.0);

        // Boost confidence for multiple pattern matches
        if (matchedPatterns.size() >= 3) {
            base = Math.min(base + 0.2, 1.0);
        }

        // Boost for high-risk patterns
        if (matchedPatterns.contains("IGNORE_PREVIOUS") || matchedPatterns.contains("DAN_MODE")) {
            base = Math.min(base + 0.1, 1.0);
        }

        // Boost for longer suspicious content
        if (content.length() > 500) {
            base = Math.min(base + 0.05, 1.0);
        }

        return Math.round(base * 100.0) / 100.0;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class InjectionDetectionResult {
        private boolean detected;
        private double confidence;
        private String injectionType;
        private List<String> matchedPatterns;
    }
}
