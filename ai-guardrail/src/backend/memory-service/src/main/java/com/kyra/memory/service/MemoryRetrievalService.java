package com.kyra.memory.service;

import com.kyra.memory.model.LongTermMemory;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;

@Service
@Slf4j
public class MemoryRetrievalService {

    private final double recencyWeight;
    private final double importanceWeight;
    private final double accessWeight;

    public MemoryRetrievalService(
            @Value("${memory.retrieval.recency-weight:0.3}") double recencyWeight,
            @Value("${memory.retrieval.importance-weight:0.4}") double importanceWeight,
            @Value("${memory.retrieval.access-weight:0.3}") double accessWeight) {
        this.recencyWeight = recencyWeight;
        this.importanceWeight = importanceWeight;
        this.accessWeight = accessWeight;
    }

    /**
     * Score and rank memories using the weighted formula:
     * score = recency_weight * recency_score + importance_weight * importance + access_weight * normalized_access_count
     */
    public List<LongTermMemory> scoreAndRank(List<LongTermMemory> memories, int topK) {
        if (memories.isEmpty()) {
            return List.of();
        }

        int maxAccessCount = memories.stream()
                .mapToInt(LongTermMemory::getAccessCount)
                .max()
                .orElse(1);
        int effectiveMax = Math.max(maxAccessCount, 1);

        return memories.stream()
                .sorted(Comparator.comparingDouble((LongTermMemory m) -> score(m, effectiveMax)).reversed())
                .limit(topK)
                .toList();
    }

    public double score(LongTermMemory memory, int maxAccessCount) {
        double recencyScore = calculateRecencyScore(memory);
        double importanceScore = memory.getImportance() != null ? memory.getImportance() : 0.5;
        double accessScore = maxAccessCount > 0
                ? (double) memory.getAccessCount() / maxAccessCount
                : 0.0;

        return recencyWeight * recencyScore
                + importanceWeight * importanceScore
                + accessWeight * accessScore;
    }

    private double calculateRecencyScore(LongTermMemory memory) {
        Instant reference = memory.getLastAccessedAt() != null
                ? memory.getLastAccessedAt()
                : memory.getCreatedAt();

        if (reference == null) {
            return 0.0;
        }

        long daysSince = ChronoUnit.DAYS.between(reference, Instant.now());
        // Decay: 1 / (1 + days). Recent memories score close to 1.
        return 1.0 / (1.0 + daysSince);
    }
}
