package com.kyra.auth.service;

import com.kyra.auth.dto.*;
import com.kyra.auth.model.Role;
import com.kyra.auth.model.Session;
import com.kyra.auth.model.Tenant;
import com.kyra.auth.model.User;
import com.kyra.auth.repository.SessionRepository;
import com.kyra.auth.repository.TenantRepository;
import com.kyra.auth.repository.UserRepository;
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
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class OnboardingService {

    private static final String VERIFY_EMAIL_PREFIX = "verify:email:";
    private static final String INVITE_PREFIX = "invite:";
    private static final String ONBOARDING_PREFIX = "onboarding:";
    private static final Duration VERIFY_TOKEN_TTL = Duration.ofHours(24);
    private static final Duration INVITE_TOKEN_TTL = Duration.ofDays(7);
    private static final Duration TRIAL_DURATION = Duration.ofDays(14);

    private final UserRepository userRepository;
    private final TenantRepository tenantRepository;
    private final SessionRepository sessionRepository;
    private final JwtService jwtService;
    private final PasswordEncoder passwordEncoder;
    private final StringRedisTemplate redisTemplate;
    private final EntityManager entityManager;

    @Transactional
    public SignupResponse signup(SignupRequest request, String ipAddress, String userAgent) {
        // Check if email already exists
        if (userRepository.findByEmail(request.getEmail()).isPresent()) {
            throw new IllegalArgumentException("An account with this email already exists");
        }

        // Create tenant
        String slug = generateSlug(request.getCompanyName());
        Tenant tenant = Tenant.builder()
                .name(request.getCompanyName() != null ? request.getCompanyName() : request.getName() + "'s Workspace")
                .slug(slug)
                .companySize(request.getCompanySize())
                .plan(Tenant.Plan.TRIAL)
                .trialEndsAt(Instant.now().plus(TRIAL_DURATION))
                .build();
        tenant = tenantRepository.save(tenant);

        // Create user with PENDING status
        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .name(request.getName())
                .status(User.Status.PENDING)
                .preferences(new HashMap<>())
                .build();
        user = userRepository.save(user);

        // Link tenant owner
        tenant.setOwnerId(user.getId());
        tenantRepository.save(tenant);

        // Assign default role (find or use null for now)
        Role defaultRole = findDefaultRole();
        if (defaultRole != null) {
            user.setRoleId(defaultRole.getId());
            userRepository.save(user);
        }

        // Generate email verification token
        String verificationToken = UUID.randomUUID().toString();
        redisTemplate.opsForValue().set(
                VERIFY_EMAIL_PREFIX + verificationToken,
                user.getId().toString(),
                VERIFY_TOKEN_TTL);

        // Initialize onboarding state in Redis
        initializeOnboardingState(user.getId(), tenant.getId());

        // Generate auth tokens
        String roleName = defaultRole != null ? defaultRole.getName() : "user";
        List<String> permissions = defaultRole != null && defaultRole.getPermissions() != null
                ? defaultRole.getPermissions() : Collections.emptyList();

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

        log.info("New user signed up: {} (tenant: {})", user.getEmail(), tenant.getSlug());

        return SignupResponse.builder()
                .userId(user.getId())
                .email(user.getEmail())
                .tenantId(tenant.getId())
                .tenantSlug(tenant.getSlug())
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .onboardingStep(1)
                .build();
    }

    @Transactional
    public void verifyEmail(String token) {
        String key = VERIFY_EMAIL_PREFIX + token;
        String userIdStr = redisTemplate.opsForValue().get(key);

        if (userIdStr == null) {
            throw new IllegalArgumentException("Invalid or expired verification token");
        }

        UUID userId = UUID.fromString(userIdStr);
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        user.setStatus(User.Status.ACTIVE);
        userRepository.save(user);

        // Remove used token
        redisTemplate.delete(key);

        // Update onboarding state
        updateOnboardingStep(userId, "emailVerified", "true");

        log.info("Email verified for user: {}", user.getEmail());
    }

    @Transactional
    public void updateCompany(UUID userId, CompanyProfileRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Find the tenant owned by this user
        Tenant tenant = findTenantByOwner(userId);

        if (request.getCompanyName() != null) {
            tenant.setName(request.getCompanyName());
        }
        if (request.getIndustry() != null) {
            tenant.setIndustry(request.getIndustry());
        }
        if (request.getCompanySize() != null) {
            tenant.setCompanySize(request.getCompanySize());
        }
        if (request.getPrimaryUseCase() != null) {
            tenant.setPrimaryUseCase(request.getPrimaryUseCase());
        }

        tenantRepository.save(tenant);

        // Update onboarding state
        updateOnboardingStep(userId, "companyCompleted", "true");

        log.info("Company profile updated for tenant: {}", tenant.getSlug());
    }

    @Transactional
    public Map<String, Object> inviteTeam(UUID userId, InviteTeamRequest request) {
        User inviter = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        Tenant tenant = findTenantByOwner(userId);

        List<String> successfulInvites = new ArrayList<>();
        List<String> failedInvites = new ArrayList<>();

        for (String email : request.getEmails()) {
            if (email == null || email.isBlank()) continue;

            try {
                // Check if user already exists
                if (userRepository.findByEmail(email).isPresent()) {
                    failedInvites.add(email + " (already registered)");
                    continue;
                }

                // Create pending user record
                User pendingUser = User.builder()
                        .email(email)
                        .passwordHash("PENDING_INVITE")
                        .name(email.split("@")[0])
                        .status(User.Status.PENDING)
                        .build();

                // Assign role
                Role role = findRoleByName(request.getRole());
                if (role != null) {
                    pendingUser.setRoleId(role.getId());
                }

                userRepository.save(pendingUser);

                // Generate invite token and store in Redis with 7-day TTL
                String inviteToken = UUID.randomUUID().toString();
                Map<String, String> inviteData = new HashMap<>();
                inviteData.put("email", email);
                inviteData.put("userId", pendingUser.getId().toString());
                inviteData.put("tenantId", tenant.getId().toString());
                inviteData.put("invitedBy", userId.toString());
                inviteData.put("role", request.getRole());

                redisTemplate.opsForHash().putAll(INVITE_PREFIX + inviteToken, inviteData);
                redisTemplate.expire(INVITE_PREFIX + inviteToken, INVITE_TOKEN_TTL);

                successfulInvites.add(email);

                log.info("Invite sent to {} by {} for tenant {}", email, inviter.getEmail(), tenant.getSlug());
            } catch (Exception e) {
                log.error("Failed to invite {}: {}", email, e.getMessage());
                failedInvites.add(email + " (error)");
            }
        }

        // Update onboarding state
        updateOnboardingStep(userId, "teamInvited", "true");
        updateOnboardingStep(userId, "teamMembersInvited", String.valueOf(successfulInvites.size()));

        Map<String, Object> result = new HashMap<>();
        result.put("successful", successfulInvites);
        result.put("failed", failedInvites);
        result.put("totalInvited", successfulInvites.size());
        return result;
    }

    @Transactional
    public void selectPersonas(UUID userId, PersonaSelectionRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Store persona preferences in user.preferences JSONB
        Map<String, Object> preferences = user.getPreferences();
        if (preferences == null) {
            preferences = new HashMap<>();
        }
        preferences.put("selectedPersonas", request.getSelectedPersonas());
        user.setPreferences(preferences);
        userRepository.save(user);

        // Update onboarding state
        updateOnboardingStep(userId, "personasSelected", "true");
        updateOnboardingStep(userId, "selectedPersonas", String.join(",", request.getSelectedPersonas()));

        log.info("Personas selected for user {}: {}", user.getEmail(), request.getSelectedPersonas());
    }

    @Transactional
    public void completeOnboarding(UUID userId) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new IllegalArgumentException("User not found"));

        // Mark user as fully onboarded
        Map<String, Object> preferences = user.getPreferences();
        if (preferences == null) {
            preferences = new HashMap<>();
        }
        preferences.put("onboardingComplete", true);
        preferences.put("onboardingCompletedAt", Instant.now().toString());
        user.setPreferences(preferences);

        // Activate user if still pending
        if (user.getStatus() == User.Status.PENDING) {
            user.setStatus(User.Status.ACTIVE);
        }

        userRepository.save(user);

        // Activate trial
        Tenant tenant = findTenantByOwner(userId);
        if (tenant.getTrialEndsAt() == null) {
            tenant.setTrialEndsAt(Instant.now().plus(TRIAL_DURATION));
            tenantRepository.save(tenant);
        }

        // Update onboarding state
        updateOnboardingStep(userId, "onboardingComplete", "true");

        log.info("Onboarding completed for user: {}", user.getEmail());
    }

    public OnboardingStatusResponse getStatus(UUID userId) {
        String key = ONBOARDING_PREFIX + userId;

        Map<Object, Object> state = redisTemplate.opsForHash().entries(key);

        boolean emailVerified = "true".equals(state.get("emailVerified"));
        boolean companyCompleted = "true".equals(state.get("companyCompleted"));
        boolean teamInvited = "true".equals(state.get("teamInvited"));
        boolean personasSelected = "true".equals(state.get("personasSelected"));
        boolean onboardingComplete = "true".equals(state.get("onboardingComplete"));

        int currentStep;
        if (onboardingComplete) {
            currentStep = 5;
        } else if (personasSelected) {
            currentStep = 5;
        } else if (teamInvited) {
            currentStep = 4;
        } else if (companyCompleted) {
            currentStep = 3;
        } else if (emailVerified) {
            currentStep = 2;
        } else {
            currentStep = 1;
        }

        // Parse selected personas
        String personasStr = (String) state.get("selectedPersonas");
        List<String> selectedPersonas = personasStr != null && !personasStr.isEmpty()
                ? Arrays.asList(personasStr.split(","))
                : Collections.emptyList();

        String membersStr = (String) state.get("teamMembersInvited");
        int teamMembersInvited = membersStr != null ? Integer.parseInt(membersStr) : 0;

        UUID tenantId = state.get("tenantId") != null
                ? UUID.fromString((String) state.get("tenantId"))
                : null;
        String tenantSlug = (String) state.get("tenantSlug");

        return OnboardingStatusResponse.builder()
                .currentStep(currentStep)
                .emailVerified(emailVerified)
                .companyCompleted(companyCompleted)
                .teamInvited(teamInvited)
                .personasSelected(personasSelected)
                .onboardingComplete(onboardingComplete)
                .tenantId(tenantId)
                .tenantSlug(tenantSlug)
                .selectedPersonas(selectedPersonas)
                .teamMembersInvited(teamMembersInvited)
                .build();
    }

    // --- Private helpers ---

    private String generateSlug(String companyName) {
        if (companyName == null || companyName.isBlank()) {
            return "workspace-" + UUID.randomUUID().toString().substring(0, 8);
        }

        String base = companyName.toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");

        if (base.isEmpty()) {
            base = "workspace";
        }

        String slug = base;
        int counter = 1;
        while (tenantRepository.existsBySlug(slug)) {
            slug = base + "-" + counter;
            counter++;
        }
        return slug;
    }

    private void initializeOnboardingState(UUID userId, UUID tenantId) {
        String key = ONBOARDING_PREFIX + userId;
        Map<String, String> state = new HashMap<>();
        state.put("emailVerified", "false");
        state.put("companyCompleted", "false");
        state.put("teamInvited", "false");
        state.put("personasSelected", "false");
        state.put("onboardingComplete", "false");
        state.put("tenantId", tenantId.toString());
        state.put("teamMembersInvited", "0");
        redisTemplate.opsForHash().putAll(key, state);
        // Onboarding state expires after 30 days
        redisTemplate.expire(key, Duration.ofDays(30));
    }

    private void updateOnboardingStep(UUID userId, String field, String value) {
        String key = ONBOARDING_PREFIX + userId;
        redisTemplate.opsForHash().put(key, field, value);
    }

    private Tenant findTenantByOwner(UUID ownerId) {
        return tenantRepository.findAll().stream()
                .filter(t -> ownerId.equals(t.getOwnerId()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Tenant not found for user"));
    }

    private Role findDefaultRole() {
        try {
            return entityManager.createQuery("SELECT r FROM Role r WHERE r.name = 'admin'", Role.class)
                    .setMaxResults(1)
                    .getResultStream()
                    .findFirst()
                    .orElse(null);
        } catch (Exception e) {
            log.warn("Could not find default role: {}", e.getMessage());
            return null;
        }
    }

    private Role findRoleByName(String roleName) {
        try {
            return entityManager.createQuery("SELECT r FROM Role r WHERE r.name = :name", Role.class)
                    .setParameter("name", roleName)
                    .setMaxResults(1)
                    .getResultStream()
                    .findFirst()
                    .orElse(null);
        } catch (Exception e) {
            log.warn("Could not find role {}: {}", roleName, e.getMessage());
            return null;
        }
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
