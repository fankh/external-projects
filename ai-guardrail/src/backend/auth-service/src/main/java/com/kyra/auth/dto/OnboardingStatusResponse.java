package com.kyra.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OnboardingStatusResponse {

    private int currentStep;
    private boolean emailVerified;
    private boolean companyCompleted;
    private boolean teamInvited;
    private boolean personasSelected;
    private boolean onboardingComplete;
    private UUID tenantId;
    private String tenantSlug;
    private List<String> selectedPersonas;
    private int teamMembersInvited;
}
