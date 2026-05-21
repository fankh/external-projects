package com.kyra.billing.dto;

import lombok.*;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UsageSummaryDTO {

    private UUID tenantId;
    private Instant periodStart;
    private Instant periodEnd;
    private Map<String, Long> metricTotals;
    private int totalRecords;
}
