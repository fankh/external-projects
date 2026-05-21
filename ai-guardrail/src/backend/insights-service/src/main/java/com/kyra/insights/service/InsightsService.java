package com.kyra.insights.service;

import com.kyra.insights.dto.TrendsDTO;
import com.kyra.insights.dto.UsageStatsDTO;
import com.kyra.insights.model.UserUsageStats;
import com.kyra.insights.repository.UserUsageStatsRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class InsightsService {

    private final UserUsageStatsRepository usageStatsRepository;

    private static final int MINUTES_PER_QUERY = 5;
    private static final int MINUTES_PER_DOCUMENT = 15;

    public UsageStatsDTO getUsageStats(UUID userId, String period) {
        int days = "month".equalsIgnoreCase(period) ? 30 : 7;
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(days);
        LocalDate previousStartDate = startDate.minusDays(days);

        List<UserUsageStats> currentStats = usageStatsRepository
                .findByUserIdAndDateBetweenOrderByDateAsc(userId, startDate, endDate);

        // Summary
        int totalQueries = currentStats.stream().mapToInt(UserUsageStats::getQueryCount).sum();
        int totalDocuments = currentStats.stream().mapToInt(UserUsageStats::getDocumentCount).sum();
        int totalTokens = currentStats.stream().mapToInt(UserUsageStats::getTokenCount).sum();
        int totalConversations = currentStats.stream().mapToInt(UserUsageStats::getConversationCount).sum();
        int totalBookmarks = currentStats.stream().mapToInt(UserUsageStats::getBookmarkCount).sum();
        int estimatedMinutesSaved = (totalQueries * MINUTES_PER_QUERY) + (totalDocuments * MINUTES_PER_DOCUMENT);

        UsageStatsDTO.SummaryStats summary = UsageStatsDTO.SummaryStats.builder()
                .totalQueries(totalQueries)
                .totalDocuments(totalDocuments)
                .totalTokens(totalTokens)
                .totalConversations(totalConversations)
                .totalBookmarks(totalBookmarks)
                .estimatedMinutesSaved(estimatedMinutesSaved)
                .period(period)
                .build();

        // Daily breakdown
        List<UsageStatsDTO.DailyStats> dailyBreakdown = currentStats.stream()
                .map(s -> UsageStatsDTO.DailyStats.builder()
                        .date(s.getDate())
                        .queries(s.getQueryCount())
                        .documents(s.getDocumentCount())
                        .tokens(s.getTokenCount())
                        .conversations(s.getConversationCount())
                        .bookmarks(s.getBookmarkCount())
                        .build())
                .collect(Collectors.toList());

        // Persona breakdown
        Map<String, Integer> personaBreakdown = new HashMap<>();
        for (UserUsageStats stats : currentStats) {
            if (stats.getPersonaUsage() != null && !stats.getPersonaUsage().equals("{}")) {
                // Simple JSON parsing for persona usage aggregation
                parsePersonaUsage(stats.getPersonaUsage(), personaBreakdown);
            }
        }

        // Period comparison
        Integer prevQueries = usageStatsRepository.sumQueryCountByUserIdAndDateBetween(userId, previousStartDate, startDate.minusDays(1));
        Integer prevDocuments = usageStatsRepository.sumDocumentCountByUserIdAndDateBetween(userId, previousStartDate, startDate.minusDays(1));

        double queryChange = prevQueries > 0 ? ((double)(totalQueries - prevQueries) / prevQueries) * 100 : 0;
        double documentChange = prevDocuments > 0 ? ((double)(totalDocuments - prevDocuments) / prevDocuments) * 100 : 0;

        UsageStatsDTO.PeriodComparison comparison = UsageStatsDTO.PeriodComparison.builder()
                .currentPeriodQueries(totalQueries)
                .previousPeriodQueries(prevQueries)
                .queryChangePercent(Math.round(queryChange * 10.0) / 10.0)
                .currentPeriodDocuments(totalDocuments)
                .previousPeriodDocuments(prevDocuments)
                .documentChangePercent(Math.round(documentChange * 10.0) / 10.0)
                .build();

        return UsageStatsDTO.builder()
                .summary(summary)
                .dailyBreakdown(dailyBreakdown)
                .personaBreakdown(personaBreakdown)
                .periodComparison(comparison)
                .build();
    }

    public TrendsDTO getTrends(UUID userId, int days) {
        LocalDate endDate = LocalDate.now();
        LocalDate startDate = endDate.minusDays(days);

        List<UserUsageStats> stats = usageStatsRepository
                .findByUserIdAndDateBetweenOrderByDateAsc(userId, startDate, endDate);

        List<TrendsDTO.DailyData> dailyData = stats.stream()
                .map(s -> TrendsDTO.DailyData.builder()
                        .date(s.getDate())
                        .queries(s.getQueryCount())
                        .documents(s.getDocumentCount())
                        .tokens(s.getTokenCount())
                        .build())
                .collect(Collectors.toList());

        return TrendsDTO.builder()
                .dailyData(dailyData)
                .build();
    }

    public Map<String, Object> getDashboardSummary(UUID userId) {
        LocalDate today = LocalDate.now();
        LocalDate weekAgo = today.minusDays(7);
        LocalDate monthAgo = today.minusDays(30);

        Map<String, Object> summary = new LinkedHashMap<>();

        // This week
        Integer weekQueries = usageStatsRepository.sumQueryCountByUserIdAndDateBetween(userId, weekAgo, today);
        Integer weekDocuments = usageStatsRepository.sumDocumentCountByUserIdAndDateBetween(userId, weekAgo, today);
        Integer weekMinutesSaved = (weekQueries * MINUTES_PER_QUERY) + (weekDocuments * MINUTES_PER_DOCUMENT);

        Map<String, Object> thisWeek = new LinkedHashMap<>();
        thisWeek.put("queries", weekQueries);
        thisWeek.put("documents", weekDocuments);
        thisWeek.put("minutesSaved", weekMinutesSaved);
        summary.put("thisWeek", thisWeek);

        // This month
        Integer monthQueries = usageStatsRepository.sumQueryCountByUserIdAndDateBetween(userId, monthAgo, today);
        Integer monthDocuments = usageStatsRepository.sumDocumentCountByUserIdAndDateBetween(userId, monthAgo, today);
        Integer monthConversations = usageStatsRepository.sumConversationCountByUserIdAndDateBetween(userId, monthAgo, today);
        Integer monthMinutesSaved = (monthQueries * MINUTES_PER_QUERY) + (monthDocuments * MINUTES_PER_DOCUMENT);

        Map<String, Object> thisMonth = new LinkedHashMap<>();
        thisMonth.put("queries", monthQueries);
        thisMonth.put("documents", monthDocuments);
        thisMonth.put("conversations", monthConversations);
        thisMonth.put("minutesSaved", monthMinutesSaved);
        summary.put("thisMonth", thisMonth);

        return summary;
    }

    private void parsePersonaUsage(String json, Map<String, Integer> accumulator) {
        // Simple parsing: {"persona1": 5, "persona2": 3}
        String stripped = json.replaceAll("[{}\"\\s]", "");
        if (stripped.isEmpty()) return;
        String[] pairs = stripped.split(",");
        for (String pair : pairs) {
            String[] kv = pair.split(":");
            if (kv.length == 2) {
                try {
                    String key = kv[0].trim();
                    int value = Integer.parseInt(kv[1].trim());
                    accumulator.merge(key, value, Integer::sum);
                } catch (NumberFormatException e) {
                    // skip malformed entries
                }
            }
        }
    }
}
