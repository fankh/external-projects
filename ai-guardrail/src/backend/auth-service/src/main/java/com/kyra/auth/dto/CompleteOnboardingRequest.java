package com.kyra.auth.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CompleteOnboardingRequest {

    private List<String> selectedPersonas;
    private String preferredLanguage;
    private String timezone;
    private boolean enableMfa;
}
