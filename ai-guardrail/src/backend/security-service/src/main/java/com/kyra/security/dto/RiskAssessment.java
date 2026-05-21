package com.kyra.security.dto;

import com.kyra.security.model.UserRiskScore;
import lombok.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RiskAssessment {

    private UUID userId;
    private int score;
    private UserRiskScore.RiskLevel riskLevel;
    private List<Map<String, Object>> factors;
    private List<String> recommendations;
}
