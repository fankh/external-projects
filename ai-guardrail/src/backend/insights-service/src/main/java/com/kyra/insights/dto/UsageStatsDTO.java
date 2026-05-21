package com.kyra.insights.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageStatsDTO {

    private SummaryStats summary;
    private List<DailyStats> dailyBreakdown;
    private Map<String, Integer> personaBreakdown;
    private PeriodComparison periodComparison;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SummaryStats {
        private Integer totalQueries;
        private Integer totalDocuments;
        private Integer totalTokens;
        private Integer totalConversations;
        private Integer totalBookmarks;
        private Integer estimatedMinutesSaved;
        private String period;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DailyStats {
        private LocalDate date;
        private Integer queries;
        private Integer documents;
        private Integer tokens;
        private Integer conversations;
        private Integer bookmarks;
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PeriodComparison {
        private Integer currentPeriodQueries;
        private Integer previousPeriodQueries;
        private Double queryChangePercent;
        private Integer currentPeriodDocuments;
        private Integer previousPeriodDocuments;
        private Double documentChangePercent;
    }
}
