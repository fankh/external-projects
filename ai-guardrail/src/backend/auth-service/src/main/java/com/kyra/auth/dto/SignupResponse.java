package com.kyra.auth.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SignupResponse {

    private UUID userId;
    private String email;
    private UUID tenantId;
    private String tenantSlug;
    private String accessToken;
    private String refreshToken;
    private int onboardingStep;
}
