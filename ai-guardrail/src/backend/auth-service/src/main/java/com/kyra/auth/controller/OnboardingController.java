package com.kyra.auth.controller;

import com.kyra.auth.dto.*;
import com.kyra.auth.service.JwtService;
import com.kyra.auth.service.OnboardingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class OnboardingController {

    private final OnboardingService onboardingService;
    private final JwtService jwtService;

    @PostMapping("/v1/auth/signup")
    public ResponseEntity<SignupResponse> signup(
            @Valid @RequestBody SignupRequest request,
            HttpServletRequest httpRequest) {
        String ipAddress = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        SignupResponse response = onboardingService.signup(request, ipAddress, userAgent);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/v1/auth/verify-email")
    public ResponseEntity<Map<String, String>> verifyEmail(
            @Valid @RequestBody VerifyEmailRequest request) {
        onboardingService.verifyEmail(request.getToken());
        return ResponseEntity.ok(Map.of("message", "Email verified successfully"));
    }

    @PostMapping("/v1/onboarding/company")
    public ResponseEntity<Map<String, String>> updateCompanyProfile(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody CompanyProfileRequest request) {
        UUID userId = extractUserId(authHeader);
        onboardingService.updateCompany(userId, request);
        return ResponseEntity.ok(Map.of("message", "Company profile updated"));
    }

    @PostMapping("/v1/onboarding/invite-team")
    public ResponseEntity<Map<String, Object>> inviteTeam(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody InviteTeamRequest request) {
        UUID userId = extractUserId(authHeader);
        Map<String, Object> result = onboardingService.inviteTeam(userId, request);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/v1/onboarding/personas")
    public ResponseEntity<Map<String, String>> selectPersonas(
            @RequestHeader("Authorization") String authHeader,
            @Valid @RequestBody PersonaSelectionRequest request) {
        UUID userId = extractUserId(authHeader);
        onboardingService.selectPersonas(userId, request);
        return ResponseEntity.ok(Map.of("message", "Personas selected"));
    }

    @PostMapping("/v1/onboarding/complete")
    public ResponseEntity<Map<String, String>> completeOnboarding(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        onboardingService.completeOnboarding(userId);
        return ResponseEntity.ok(Map.of("message", "Onboarding completed successfully"));
    }

    @GetMapping("/v1/onboarding/status")
    public ResponseEntity<OnboardingStatusResponse> getOnboardingStatus(
            @RequestHeader("Authorization") String authHeader) {
        UUID userId = extractUserId(authHeader);
        OnboardingStatusResponse status = onboardingService.getStatus(userId);
        return ResponseEntity.ok(status);
    }

    // --- Private helpers ---

    private UUID extractUserId(String authHeader) {
        String token = extractBearerToken(authHeader);
        return jwtService.extractUserId(token);
    }

    private String extractBearerToken(String authHeader) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        throw new IllegalArgumentException("Invalid Authorization header");
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
