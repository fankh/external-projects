package com.kyra.security.dto;

import lombok.*;

import java.util.List;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DlpScanResult {

    private boolean blocked;
    private String reason;
    private String redactedContent;
    private List<DlpViolation> violations;
    private int riskScore;
}
