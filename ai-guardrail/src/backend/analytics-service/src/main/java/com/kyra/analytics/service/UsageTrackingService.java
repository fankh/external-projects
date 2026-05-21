package com.kyra.analytics.service;

import com.kyra.analytics.dto.TrackUsageRequest;
import com.kyra.analytics.dto.UsageSummaryDTO;
import com.kyra.analytics.model.UsageDaily;
import com.kyra.analytics.repository.UsageDailyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class UsageTrackingService {

    private static final BigDecimal COST_PER_1K_PROMPT_TOKENS = new BigDecimal("0.003");
    private static final BigDecimal COST_PER_1K_COMPLETION_TOKENS = new BigDecimal("0.006");

    private final UsageDailyRepository usageDailyRepository;
    private final QuotaService quotaService;

    @Transactional
    public void trackUsage(TrackUsageRequest request) {
        log.info("Tracking usage for user {} persona={} queries={} tokens={}+{}",
                request.getUserId(), request.getPersonaId(),
                request.getQueryCount(), request.getPromptTokens(), request.getCompletionTokens());

        LocalDate today = LocalDate.now();
        long totalTokens = request.getPromptTokens() + request.getCompletionTokens();
        BigDecimal cost = calculateCost(request.getPromptTokens(), request.getCompletionTokens());

        // Find or create daily record
        List<UsageDaily> existing = usageDailyRepository
                .findByUserIdAndDateAndPersonaId(request.getUserId(), today, request.getPersonaId());

        if (!existing.isEmpty()) {
            UsageDaily record = existing.get(0);
            record.setQueryCount(record.getQueryCount() + request.getQueryCount());
            record.setTokenCount(record.getTokenCount() + totalTokens);
            record.setPromptTokens(record.getPromptTokens() + request.getPromptTokens());
            record.setCompletionTokens(record.getCompletionTokens() + request.getCompletionTokens());
            record.setEstimatedCost(record.getEstimatedCost().add(cost));
            usageDailyRepository.save(record);
        } else {
            UsageDaily record = UsageDaily.builder()
                    .date(today)
                    .userId(request.getUserId())
                    .personaId(request.getPersonaId())
                    .purposeId(request.getPurposeId())
                    .queryCount(request.getQueryCount())
                    .tokenCount(totalTokens)
                    .promptTokens(request.getPromptTokens())
                    .completionTokens(request.getCompletionTokens())
                    .estimatedCost(cost)
                    .build();
            usageDailyRepository.save(record);
        }

        // Update current usage counters
        quotaService.incrementUsage(request.getUserId(), request.getQueryCount(), totalTokens);
    }

    public UsageSummaryDTO getUserSummary(UUID userId, String period) {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = switch (period) {
            case "week" -> endDate.minusWeeks(1);
            case "month" -> endDate.minusMonths(1);
            default -> endDate; // day
        };

        List<UsageDaily> records = usageDailyRepository.findByUserIdAndDateBetween(userId, startDate, endDate);

        long totalQueries = records.stream().mapToLong(UsageDaily::getQueryCount).sum();
        long totalTokens = records.stream().mapToLong(UsageDaily::getTokenCount).sum();
        BigDecimal totalCost = records.stream()
                .map(UsageDaily::getEstimatedCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Aggregate by persona
        Map<UUID, UsageSummaryDTO.PersonaUsage> byPersona = new HashMap<>();
        List<Object[]> personaAgg = usageDailyRepository.aggregateByPersona(userId, startDate, endDate);
        for (Object[] row : personaAgg) {
            UUID personaId = (UUID) row[0];
            if (personaId != null) {
                byPersona.put(personaId, UsageSummaryDTO.PersonaUsage.builder()
                        .personaId(personaId)
                        .queryCount(((Number) row[1]).longValue())
                        .tokenCount(((Number) row[2]).longValue())
                        .build());
            }
        }

        // Aggregate by day
        List<UsageSummaryDTO.DayUsage> byDay = new ArrayList<>();
        List<Object[]> dayAgg = usageDailyRepository.aggregateByDay(userId, startDate, endDate);
        for (Object[] row : dayAgg) {
            byDay.add(UsageSummaryDTO.DayUsage.builder()
                    .date(row[0].toString())
                    .queryCount(((Number) row[1]).longValue())
                    .tokenCount(((Number) row[2]).longValue())
                    .build());
        }

        return UsageSummaryDTO.builder()
                .userId(userId)
                .totalQueries(totalQueries)
                .totalTokens(totalTokens)
                .estimatedCost(totalCost)
                .byPersona(byPersona)
                .byDay(byDay)
                .build();
    }

    public Map<String, Object> getDepartmentAggregation(UUID departmentId, String period) {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = switch (period) {
            case "week" -> endDate.minusWeeks(1);
            case "month" -> endDate.minusMonths(1);
            default -> endDate;
        };

        List<UsageDaily> records = usageDailyRepository
                .findByDepartmentIdAndDateBetween(departmentId, startDate, endDate);

        long totalQueries = records.stream().mapToLong(UsageDaily::getQueryCount).sum();
        long totalTokens = records.stream().mapToLong(UsageDaily::getTokenCount).sum();
        BigDecimal totalCost = records.stream()
                .map(UsageDaily::getEstimatedCost)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        long uniqueUsers = records.stream().map(UsageDaily::getUserId).distinct().count();

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("departmentId", departmentId);
        result.put("period", period);
        result.put("totalQueries", totalQueries);
        result.put("totalTokens", totalTokens);
        result.put("estimatedCost", totalCost);
        result.put("uniqueUsers", uniqueUsers);
        return result;
    }

    public Map<String, Object> getSystemOverview(String period) {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = switch (period) {
            case "week" -> endDate.minusWeeks(1);
            case "month" -> endDate.minusMonths(1);
            default -> endDate;
        };

        Object[] overview = usageDailyRepository.systemOverview(startDate, endDate);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("period", period);
        result.put("totalQueries", overview[0] != null ? ((Number) overview[0]).longValue() : 0L);
        result.put("totalTokens", overview[1] != null ? ((Number) overview[1]).longValue() : 0L);
        result.put("estimatedCost", overview[2] != null ? overview[2] : BigDecimal.ZERO);
        result.put("activeUsers", overview[3] != null ? ((Number) overview[3]).longValue() : 0L);

        // Department breakdown
        List<Object[]> deptAgg = usageDailyRepository.aggregateByDepartment(startDate, endDate);
        List<Map<String, Object>> departments = deptAgg.stream().map(row -> {
            Map<String, Object> dept = new LinkedHashMap<>();
            dept.put("departmentId", row[0]);
            dept.put("totalQueries", ((Number) row[1]).longValue());
            dept.put("totalTokens", ((Number) row[2]).longValue());
            dept.put("estimatedCost", row[3]);
            return dept;
        }).collect(Collectors.toList());
        result.put("byDepartment", departments);

        return result;
    }

    private BigDecimal calculateCost(long promptTokens, long completionTokens) {
        BigDecimal promptCost = COST_PER_1K_PROMPT_TOKENS
                .multiply(BigDecimal.valueOf(promptTokens))
                .divide(BigDecimal.valueOf(1000), 6, RoundingMode.HALF_UP);
        BigDecimal completionCost = COST_PER_1K_COMPLETION_TOKENS
                .multiply(BigDecimal.valueOf(completionTokens))
                .divide(BigDecimal.valueOf(1000), 6, RoundingMode.HALF_UP);
        return promptCost.add(completionCost).setScale(4, RoundingMode.HALF_UP);
    }
}
