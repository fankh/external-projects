package com.kyra.analytics.dto;

import lombok.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageSummaryDTO {

    private UUID userId;
    private long totalQueries;
    private long totalTokens;
    private BigDecimal estimatedCost;
    private Map<UUID, PersonaUsage> byPersona;
    private List<DayUsage> byDay;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class PersonaUsage {
        private UUID personaId;
        private long queryCount;
        private long tokenCount;
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class DayUsage {
        private String date;
        private long queryCount;
        private long tokenCount;
    }
}
