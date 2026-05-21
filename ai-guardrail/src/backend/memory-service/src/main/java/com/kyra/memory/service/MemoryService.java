package com.kyra.memory.service;

import com.kyra.memory.client.MLMemoryClient;
import com.kyra.memory.dto.*;
import com.kyra.memory.model.LongTermMemory;
import com.kyra.memory.model.MemorySummary;
import com.kyra.memory.repository.LongTermMemoryRepository;
import com.kyra.memory.repository.MemorySummaryRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MemoryService {

    private final LongTermMemoryRepository memoryRepository;
    private final MemorySummaryRepository summaryRepository;
    private final MemoryRetrievalService retrievalService;
    private final MLMemoryClient mlMemoryClient;

    @Value("${memory.retrieval.top-k:20}")
    private int topK;

    /**
     * Retrieve top-K memories scored by: recency (0.3) + importance (0.4) + relevance (0.3).
     * Updates access_count for returned memories.
     */
    @Transactional
    public MemoryContextDTO getContext(UUID userId, UUID conversationId) {
        log.debug("Getting memory context for user={} conversation={}", userId, conversationId);

        List<LongTermMemory> activeMemories = memoryRepository
                .findByUserIdAndStatus(userId, LongTermMemory.MemoryStatus.ACTIVE);

        List<LongTermMemory> ranked = retrievalService.scoreAndRank(activeMemories, topK);

        // Update access counts
        Instant now = Instant.now();
        for (LongTermMemory memory : ranked) {
            memory.setAccessCount(memory.getAccessCount() + 1);
            memory.setLastAccessedAt(now);
        }
        memoryRepository.saveAll(ranked);

        List<MemoryDTO> memoryDTOs = ranked.stream()
                .map(MemoryDTO::fromEntity)
                .toList();

        // Get latest summary for conversation
        String summary = null;
        if (conversationId != null) {
            List<MemorySummary> summaries = summaryRepository
                    .findByConversationIdOrderByMessageRangeStartDesc(conversationId);
            if (!summaries.isEmpty()) {
                summary = summaries.getFirst().getSummary();
            }
        }

        // Extract user preferences from semantic/entity memories
        Map<String, Object> userPreferences = ranked.stream()
                .filter(m -> m.getMemoryType() == LongTermMemory.MemoryType.SEMANTIC
                        || m.getMemoryType() == LongTermMemory.MemoryType.ENTITY)
                .collect(Collectors.toMap(
                        LongTermMemory::getKey,
                        LongTermMemory::getValue,
                        (existing, replacement) -> existing,
                        LinkedHashMap::new
                ));

        return MemoryContextDTO.builder()
                .memories(memoryDTOs)
                .summary(summary)
                .userPreferences(userPreferences)
                .build();
    }

    /**
     * Call ML service /v1/memory/extract, store returned entities/facts/preferences.
     */
    @Transactional
    public List<MemoryDTO> extractMemories(ExtractMemoriesRequest request) {
        log.info("Extracting memories for user={} conversation={}", request.getUserId(), request.getConversationId());

        List<Map<String, Object>> extracted = mlMemoryClient.extractMemories(request.getMessages());

        List<LongTermMemory> newMemories = new ArrayList<>();
        for (Map<String, Object> item : extracted) {
            LongTermMemory memory = LongTermMemory.builder()
                    .userId(request.getUserId())
                    .conversationId(request.getConversationId())
                    .memoryType(parseMemoryType((String) item.get("type")))
                    .key((String) item.get("key"))
                    .value((String) item.get("value"))
                    .importance(parseFloat(item.get("importance"), 0.5f))
                    .confidence(parseFloat(item.get("confidence"), 0.8f))
                    .status(LongTermMemory.MemoryStatus.ACTIVE)
                    .build();
            newMemories.add(memory);
        }

        List<LongTermMemory> saved = memoryRepository.saveAll(newMemories);
        log.info("Stored {} extracted memories for user={}", saved.size(), request.getUserId());

        return saved.stream()
                .map(MemoryDTO::fromEntity)
                .toList();
    }

    /**
     * Merge duplicate/similar memories, archive low-importance ones, update summaries.
     */
    @Transactional
    public Map<String, Object> consolidate(UUID userId) {
        log.info("Consolidating memories for user={}", userId);

        List<LongTermMemory> activeMemories = memoryRepository
                .findByUserIdAndStatus(userId, LongTermMemory.MemoryStatus.ACTIVE);

        if (activeMemories.isEmpty()) {
            return Map.of("merged", 0, "archived", 0, "unchanged", 0);
        }

        // Convert to maps for ML service
        List<Map<String, Object>> memoryMaps = activeMemories.stream()
                .map(m -> {
                    Map<String, Object> map = new HashMap<>();
                    map.put("id", m.getId().toString());
                    map.put("type", m.getMemoryType().name().toLowerCase());
                    map.put("key", m.getKey());
                    map.put("value", m.getValue());
                    map.put("importance", m.getImportance());
                    map.put("confidence", m.getConfidence());
                    return map;
                })
                .toList();

        Map<String, Object> result = mlMemoryClient.consolidateMemories(memoryMaps);

        int mergedCount = 0;
        int archivedCount = 0;

        // Process merged memories
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> merged = (List<Map<String, Object>>) result.getOrDefault("merged", List.of());
        for (Map<String, Object> mergedItem : merged) {
            @SuppressWarnings("unchecked")
            List<String> sourceIds = (List<String>) mergedItem.get("source_ids");
            if (sourceIds != null && sourceIds.size() > 1) {
                // Archive all but the first, update the first with merged value
                boolean first = true;
                for (String idStr : sourceIds) {
                    UUID memId = UUID.fromString(idStr);
                    memoryRepository.findById(memId).ifPresent(m -> {
                        m.setStatus(LongTermMemory.MemoryStatus.ARCHIVED);
                        memoryRepository.save(m);
                    });
                }
                // Create new merged memory
                LongTermMemory newMerged = LongTermMemory.builder()
                        .userId(userId)
                        .memoryType(parseMemoryType((String) mergedItem.get("type")))
                        .key((String) mergedItem.get("key"))
                        .value((String) mergedItem.get("value"))
                        .importance(parseFloat(mergedItem.get("importance"), 0.5f))
                        .confidence(parseFloat(mergedItem.get("confidence"), 0.8f))
                        .status(LongTermMemory.MemoryStatus.ACTIVE)
                        .build();
                memoryRepository.save(newMerged);
                mergedCount++;
            }
        }

        // Process archived memories
        @SuppressWarnings("unchecked")
        List<String> archivedIds = (List<String>) result.getOrDefault("archived", List.of());
        for (String idStr : archivedIds) {
            try {
                UUID memId = UUID.fromString(idStr);
                memoryRepository.findById(memId).ifPresent(m -> {
                    m.setStatus(LongTermMemory.MemoryStatus.ARCHIVED);
                    memoryRepository.save(m);
                });
                archivedCount++;
            } catch (IllegalArgumentException e) {
                log.warn("Invalid UUID in archived list: {}", idStr);
            }
        }

        int unchangedCount = activeMemories.size() - mergedCount - archivedCount;
        log.info("Consolidation complete for user={}: merged={} archived={} unchanged={}",
                userId, mergedCount, archivedCount, unchangedCount);

        return Map.of("merged", mergedCount, "archived", archivedCount, "unchanged", Math.max(0, unchangedCount));
    }

    /**
     * Count by type, total, active vs archived.
     */
    public Map<String, Object> getStats(UUID userId) {
        long total = memoryRepository.countByUserId(userId);
        long active = memoryRepository.countByUserIdAndStatus(userId, LongTermMemory.MemoryStatus.ACTIVE);
        long archived = memoryRepository.countByUserIdAndStatus(userId, LongTermMemory.MemoryStatus.ARCHIVED);
        long expired = memoryRepository.countByUserIdAndStatus(userId, LongTermMemory.MemoryStatus.EXPIRED);

        Map<String, Long> byType = new LinkedHashMap<>();
        for (LongTermMemory.MemoryType type : LongTermMemory.MemoryType.values()) {
            byType.put(type.name().toLowerCase(), memoryRepository.countByUserIdAndMemoryType(userId, type));
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("total", total);
        stats.put("active", active);
        stats.put("archived", archived);
        stats.put("expired", expired);
        stats.put("byType", byType);
        return stats;
    }

    public Page<MemoryDTO> listMemories(UUID userId, String type, Pageable pageable) {
        if (type != null && !type.isBlank()) {
            LongTermMemory.MemoryType memoryType = parseMemoryType(type);
            return memoryRepository.findByUserIdAndMemoryType(userId, memoryType, pageable)
                    .map(MemoryDTO::fromEntity);
        }
        return memoryRepository.findByUserId(userId, pageable)
                .map(MemoryDTO::fromEntity);
    }

    @Transactional
    public void deleteMemory(UUID id) {
        memoryRepository.deleteById(id);
    }

    private LongTermMemory.MemoryType parseMemoryType(String type) {
        if (type == null) return LongTermMemory.MemoryType.SEMANTIC;
        return LongTermMemory.MemoryType.valueOf(type.toUpperCase());
    }

    private float parseFloat(Object value, float defaultValue) {
        if (value == null) return defaultValue;
        if (value instanceof Number n) return n.floatValue();
        try {
            return Float.parseFloat(value.toString());
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }
}
