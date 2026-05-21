package com.kyra.auth.controller;

import com.kyra.auth.dto.*;
import com.kyra.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest request,
            HttpServletRequest httpRequest) {
        String ipAddress = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        LoginResponse response = authService.login(request, ipAddress, userAgent);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/mfa/verify")
    public ResponseEntity<LoginResponse> verifyMfa(
            @Valid @RequestBody MfaVerifyRequest request,
            HttpServletRequest httpRequest) {
        String ipAddress = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        LoginResponse response = authService.verifyMfa(request, ipAddress, userAgent);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/refresh")
    public ResponseEntity<LoginResponse> refresh(
            @Valid @RequestBody RefreshTokenRequest request,
            HttpServletRequest httpRequest) {
        String ipAddress = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        LoginResponse response = authService.refreshTokens(
                request.getRefreshToken(), ipAddress, userAgent);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/logout")
    public ResponseEntity<Map<String, String>> logout(
            @RequestHeader("Authorization") String authHeader) {
        String token = extractBearerToken(authHeader);
        authService.logout(token);
        return ResponseEntity.ok(Map.of("message", "Logged out successfully"));
    }

    @GetMapping("/me")
    public ResponseEntity<UserDTO> getCurrentUser(
            @RequestHeader("Authorization") String authHeader) {
        String token = extractBearerToken(authHeader);
        UserDTO user = authService.getCurrentUser(token);
        return ResponseEntity.ok(user);
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

    // ---------- V014: MFA management endpoints ----------

    @PostMapping("/mfa/setup")
    public ResponseEntity<Map<String, Object>> setupMfa(@RequestHeader("Authorization") String authHeader) {
        String token = extractBearerToken(authHeader);
        UserDTO user = authService.getCurrentUser(token);
        return ResponseEntity.ok(authService.setupMfa(user.getId()));
    }

    public record EnableReq(String secret, String code) {}
    @PostMapping("/mfa/enable")
    public ResponseEntity<Map<String, Object>> enableMfa(@RequestHeader("Authorization") String authHeader,
                                                          @RequestBody EnableReq req) {
        String token = extractBearerToken(authHeader);
        UserDTO user = authService.getCurrentUser(token);
        return ResponseEntity.ok(authService.enableMfa(user.getId(), req.secret(), req.code()));
    }

    public record CodeReq(String code) {}
    @PostMapping("/mfa/disable")
    public ResponseEntity<Map<String, Object>> disableMfa(@RequestHeader("Authorization") String authHeader,
                                                           @RequestBody CodeReq req) {
        String token = extractBearerToken(authHeader);
        UserDTO user = authService.getCurrentUser(token);
        authService.disableMfa(user.getId(), req.code());
        return ResponseEntity.ok(Map.of("enabled", false));
    }

    @PostMapping("/mfa/backup-codes/regenerate")
    public ResponseEntity<Map<String, Object>> regenerateBackupCodes(@RequestHeader("Authorization") String authHeader,
                                                                      @RequestBody CodeReq req) {
        String token = extractBearerToken(authHeader);
        UserDTO user = authService.getCurrentUser(token);
        return ResponseEntity.ok(Map.of("backupCodes", authService.regenerateBackupCodes(user.getId(), req.code())));
    }
}
