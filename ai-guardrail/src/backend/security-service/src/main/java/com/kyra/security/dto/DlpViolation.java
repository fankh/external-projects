package com.kyra.security.dto;

import com.kyra.security.model.DlpPattern;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DlpViolation {

    private UUID patternId;
    private String patternName;
    private DlpPattern.Category category;
    private DlpPattern.Severity severity;
    private String matchedText;
    private DlpPattern.Action action;
}
