package com.kyra.auth.service;

import com.kyra.auth.dto.*;
import com.kyra.auth.model.Role;
import com.kyra.auth.model.Session;
import com.kyra.auth.model.User;
import com.kyra.auth.repository.SessionRepository;
import com.kyra.auth.repository.UserRepository;
import io.jsonwebtoken.Claims;
import jakarta.persistence.EntityManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final Duration LOCKOUT_DURATION = Duration.ofMinutes(30);
    private static final String BLACKLIST_PREFIX = "token:blacklist:";

    private final UserRepository userRepository;
    private final SessionRepository sessionRepository;
    private final JwtService jwtService;
    private final MfaService mfaService;
    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redisTemplate;
    private final EntityManager entityManager;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private UbaClient ubaClient;

    @Transactional
    public LoginResponse login(LoginRequest request, String ipAddress, String userAgent) {
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new IllegalArgumentException("Invalid email or password"));

        // Check account status
        if (user.getStatus() != User.Status.ACTIVE) {
            throw new IllegalStateException("Account is not active");
        }

        // Check lockout
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(Instant.now())) {
            throw new IllegalStateException("Account is locked. Try again later.");
        }

        // Validate password
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            handleFailedLogin(user);
            throw new IllegalArgumentException("Invalid email or password");
        }

        // Reset failed attempts on successful password check
        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);

        // Check MFA
        if (user.isMfaEnabled()) {
            String mfaToken = jwtService.generateMfaToken(user.getId());
            return LoginResponse.builder()
                    .requiresMfa(true)
                    .mfaToken(mfaToken)
                    .build();
        }

        return createSessionAndTokens(user, ipAddress, userAgent);
    }

    @Transactional
    public LoginResponse verifyMfa(MfaVerifyRequest request, String ipAddress, String userAgent) {
        // Validate MFA token
        if (!jwtService.isTokenValid(request.getMfaToken())) {
            throw new IllegalArgumentException("Invalid or expired MFA token");
        }

        String tokenType = jwtService.extractTokenType(request.getMfaToken());
        if (!"mfa".equals(tokenType)) {
            throw new IllegalArgumentException("Invalid token type");
        }

        UUID userId = jwtService.extractUserId(request.getMfaToken());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Verify TOTP code OR backup code
        boolean ok = mfaService.verifyCode(user.getMfaSecret(), request.getCode());
        if (!ok && request.getCode() != null && request.getCode().length() == 8) {
            if (mfaService.matchesBackupCode(request.getCode(), user.getMfaBackupCodes(), passwordEncoder)) {
                if (user.getMfaBackupCodes() != null) {
                    user.getMfaBackupCodes().removeIf(h -> passwordEncoder.matches(request.getCode(), h));
                    userRepository.save(user);
                }
                ok = true;
            }
        }
        if (!ok) {
            throw new IllegalArgumentException("Invalid MFA code");
        }

        return createSessionAndTokens(user, ipAddress, userAgent);
    }

    // ---------- V014: MFA setup / enable / disable / regenerate ----------

    @Transactional
    public java.util.Map<String, Object> setupMfa(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        String secret = mfaService.generateSecret();
        String qrCode = mfaService.generateQrCodeDataUri(secret, user.getEmail());
        return java.util.Map.of("secret", secret, "qrCodeDataUri", qrCode);
    }

    @Transactional
    public java.util.Map<String, Object> enableMfa(UUID userId, String secret, String code) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (!mfaService.verifyCode(secret, code)) {
            throw new IllegalArgumentException("Invalid TOTP code");
        }
        user.setMfaSecret(secret);
        user.setMfaEnabled(true);
        java.util.List<String> plain = mfaService.generateBackupCodes();
        user.setMfaBackupCodes(mfaService.hashBackupCodes(plain, passwordEncoder));
        userRepository.save(user);
        return java.util.Map.of("enabled", true, "backupCodes", plain);
    }

    @Transactional
    public void disableMfa(UUID userId, String code) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        boolean ok = user.getMfaSecret() != null && mfaService.verifyCode(user.getMfaSecret(), code);
        if (!ok && mfaService.matchesBackupCode(code, user.getMfaBackupCodes(), passwordEncoder)) ok = true;
        if (!ok) throw new IllegalArgumentException("Invalid code");
        user.setMfaEnabled(false);
        user.setMfaSecret(null);
        user.setMfaBackupCodes(java.util.Collections.emptyList());
        userRepository.save(user);
    }

    @Transactional
    public java.util.List<String> regenerateBackupCodes(UUID userId, String code) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));
        if (user.getMfaSecret() == null || !mfaService.verifyCode(user.getMfaSecret(), code)) {
            throw new IllegalArgumentException("Invalid TOTP code");
        }
        java.util.List<String> plain = mfaService.generateBackupCodes();
        user.setMfaBackupCodes(mfaService.hashBackupCodes(plain, passwordEncoder));
        userRepository.save(user);
        return plain;
    }

    @Transactional
    public LoginResponse refreshTokens(String refreshToken, String ipAddress, String userAgent) {
        if (!jwtService.isTokenValid(refreshToken)) {
            throw new IllegalArgumentException("Invalid or expired refresh token");
        }

        String tokenType = jwtService.extractTokenType(refreshToken);
        if (!"refresh".equals(tokenType)) {
            throw new IllegalArgumentException("Invalid token type");
        }

        UUID userId = jwtService.extractUserId(refreshToken);
        String tokenHash = hashToken(refreshToken);

        // Find the active session with this refresh token
        List<Session> sessions = sessionRepository.findByUserIdAndIsActive(userId, true);
        Session session = sessions.stream()
                .filter(s -> s.getRefreshTokenHash().equals(tokenHash))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Session not found or inactive"));

        if (session.getExpiresAt().isBefore(Instant.now())) {
            session.setActive(false);
            sessionRepository.save(session);
            throw new IllegalArgumentException("Session expired");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Generate new tokens
        Role role = user.getRoleId() != null
                ? entityManager.find(Role.class, user.getRoleId())
                : null;
        List<String> permissions = role != null && role.getPermissions() != null
                ? role.getPermissions()
                : Collections.emptyList();
        String roleName = role != null ? role.getName() : "user";

        String newAccessToken = jwtService.generateAccessToken(
                user.getId(), user.getEmail(), roleName,
                user.getDepartmentId(), permissions);
        String newRefreshToken = jwtService.generateRefreshToken(user.getId());

        // Rotate refresh token in session
        session.setRefreshTokenHash(hashToken(newRefreshToken));
        session.setLastUsedAt(Instant.now());
        session.setIpAddress(ipAddress);
        session.setUserAgent(userAgent);
        sessionRepository.save(session);

        return LoginResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .user(toUserDTO(user, roleName))
                .build();
    }

    @Transactional
    public void logout(String accessToken) {
        // Blacklist the access token in Redis
        if (accessToken != null && jwtService.isTokenValid(accessToken)) {
            Claims claims = jwtService.parseToken(accessToken);
            long ttl = claims.getExpiration().getTime() - System.currentTimeMillis();
            if (ttl > 0) {
                redisTemplate.opsForValue().set(
                        BLACKLIST_PREFIX + accessToken, "1",
                        Duration.ofMillis(ttl));
            }

            // Deactivate session
            UUID userId = UUID.fromString(claims.getSubject());
            List<Session> sessions = sessionRepository.findByUserIdAndIsActive(userId, true);
            sessions.forEach(session -> session.setActive(false));
            sessionRepository.saveAll(sessions);
        }
    }

    public UserDTO getCurrentUser(String accessToken) {
        if (isTokenBlacklisted(accessToken)) {
            throw new IllegalArgumentException("Token has been revoked");
        }

        Claims claims = jwtService.parseToken(accessToken);
        UUID userId = UUID.fromString(claims.getSubject());
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        String roleName = claims.get("role", String.class);
        return toUserDTO(user, roleName);
    }

    public boolean isTokenBlacklisted(String token) {
        return Boolean.TRUE.equals(redisTemplate.hasKey(BLACKLIST_PREFIX + token));
    }

    // --- Private helpers ---

    private void handleFailedLogin(User user) {
        int attempts = user.getFailedLoginAttempts() + 1;
        user.setFailedLoginAttempts(attempts);

        if (attempts >= MAX_FAILED_ATTEMPTS) {
            user.setLockedUntil(Instant.now().plus(LOCKOUT_DURATION));
            user.setStatus(User.Status.LOCKED);
            log.warn("Account locked for user {} after {} failed attempts", user.getEmail(), attempts);
        }

        userRepository.save(user);
    }

    private LoginResponse createSessionAndTokens(User user, String ipAddress, String userAgent) {
        if (ubaClient != null) {
            try { ubaClient.observeLogin(null, user.getId(), ipAddress, userAgent); } catch (Exception ignored) {}
        }
        Role role = user.getRoleId() != null
                ? entityManager.find(Role.class, user.getRoleId())
                : null;
        List<String> permissions = role != null && role.getPermissions() != null
                ? role.getPermissions()
                : Collections.emptyList();
        String roleName = role != null ? role.getName() : "user";

        String accessToken = jwtService.generateAccessToken(
                user.getId(), user.getEmail(), roleName,
                user.getDepartmentId(), permissions);
        String refreshToken = jwtService.generateRefreshToken(user.getId());

        // Create session
        Session session = Session.builder()
                .userId(user.getId())
                .refreshTokenHash(hashToken(refreshToken))
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .isActive(true)
                .expiresAt(Instant.now().plusMillis(jwtService.getRefreshTokenExpirationMs()))
                .lastUsedAt(Instant.now())
                .build();
        sessionRepository.save(session);

        // Update last login
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .user(toUserDTO(user, roleName))
                .requiresMfa(false)
                .build();
    }

    private UserDTO toUserDTO(User user, String roleName) {
        return UserDTO.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .role(roleName)
                .avatarUrl(user.getAvatarUrl())
                .build();
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
