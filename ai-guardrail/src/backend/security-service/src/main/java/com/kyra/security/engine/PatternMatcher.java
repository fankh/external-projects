package com.kyra.security.engine;

import com.kyra.security.model.DlpPattern;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
@Slf4j
public class PatternMatcher {

    private final ConcurrentHashMap<UUID, Pattern> compiledPatterns = new ConcurrentHashMap<>();

    public Pattern getCompiledPattern(DlpPattern dlpPattern) {
        return compiledPatterns.computeIfAbsent(dlpPattern.getId(), id -> {
            try {
                return Pattern.compile(dlpPattern.getPattern(), Pattern.CASE_INSENSITIVE | Pattern.MULTILINE);
            } catch (Exception e) {
                log.error("Failed to compile pattern '{}': {}", dlpPattern.getName(), e.getMessage());
                return null;
            }
        });
    }

    public List<MatchResult> match(String text, DlpPattern dlpPattern) {
        List<MatchResult> results = new ArrayList<>();
        Pattern compiled = getCompiledPattern(dlpPattern);
        if (compiled == null) {
            return results;
        }

        try {
            Matcher matcher = compiled.matcher(text);
            while (matcher.find()) {
                results.add(new MatchResult(
                        dlpPattern.getId(),
                        dlpPattern.getName(),
                        dlpPattern.getCategory(),
                        dlpPattern.getSeverity(),
                        dlpPattern.getAction(),
                        matcher.group(),
                        matcher.start(),
                        matcher.end()
                ));
            }
        } catch (Exception e) {
            log.error("Error matching pattern '{}' against text: {}", dlpPattern.getName(), e.getMessage());
        }
        return results;
    }

    public void invalidatePattern(UUID patternId) {
        compiledPatterns.remove(patternId);
    }

    public void invalidateAll() {
        compiledPatterns.clear();
    }

    public record MatchResult(
            UUID patternId,
            String patternName,
            DlpPattern.Category category,
            DlpPattern.Severity severity,
            DlpPattern.Action action,
            String matchedText,
            int start,
            int end
    ) {}
}
