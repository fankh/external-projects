package com.kyra.feedback.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeedbackStatsDTO {

    private long totalPositive;
    private long totalNegative;
    private double satisfactionRate;
    private Map<String, Long> topReasons;
}
