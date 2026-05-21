package com.kyra.analytics.dto;

import lombok.*;

import java.time.Instant;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class QuotaCheckResult {

    private boolean allowed;
    private int remaining;
    private int limit;
    private Instant resetAt;
    private String quotaTier;
}
