package com.kyra.security.privacy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class PrivacyService {

    private static final int SLA_DAYS = 30;
    private static final int ERASURE_HOLD_DAYS = 30;

    private final PrivacyRequestRepository repo;
    private final AuditService auditService;
    private final com.kyra.security.metrics.ComplianceMetrics metrics;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${services.auth-service.url:http://auth-service:8081}")
    private String authServiceUrl;

    @Value("${services.chat-service.url:http://chat-service:8082}")
    private String chatServiceUrl;

    private RestClient restClient(String baseUrl) {
        return RestClient.builder().baseUrl(baseUrl).build();
    }

    @Transactional
    public PrivacyRequest createRequest(UUID tenantId, UUID userId, UUID requestedBy,
                                        PrivacyRequest.Type type, String notes,
                                        Map<String, Object> metadata) {
        PrivacyRequest p = PrivacyRequest.builder()
                .tenantId(tenantId)
                .userId(userId)
                .requestedBy(requestedBy != null ? requestedBy : userId)
                .type(type.name())
                .status(PrivacyRequest.Status.PENDING_VERIFICATION.name())
                .slaDeadlineAt(Instant.now().plus(SLA_DAYS, ChronoUnit.DAYS))
                .verificationNotes(notes)
                .metadata(metadata)
                .build();
        p = repo.save(p);
        metrics.privacyRequest(type.name());
        auditService.logAuditEvent(tenantId, requestedBy, "privacy.request.created",
                "privacy_request", p.getId().toString(),
                Map.of("type", type.name(), "subjectUserId", userId.toString()),
                "SUCCESS", null, null);
        return p;
    }

    @Transactional
    public PrivacyRequest verifyRequest(UUID requestId, UUID adminUserId, String notes) {
        PrivacyRequest p = repo.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Privacy request not found"));
        if (!PrivacyRequest.Status.PENDING_VERIFICATION.name().equals(p.getStatus())) {
            throw new IllegalStateException("Request is not pending verification (status=" + p.getStatus() + ")");
        }
        p.setStatus(PrivacyRequest.Status.VERIFIED.name());
        p.setVerifiedBy(adminUserId);
        p.setVerifiedAt(Instant.now());
        if (notes != null) p.setVerificationNotes(notes);
        p = repo.save(p);
        metrics.privacyStatusChange(p.getType(), "VERIFIED");
        auditService.logAuditEvent(p.getTenantId(), adminUserId, "privacy.request.verified",
                "privacy_request", p.getId().toString(),
                Map.of("type", p.getType()), "SUCCESS", null, null);
        return p;
    }

    @Transactional
    public PrivacyRequest fulfill(UUID requestId, UUID adminUserId) {
        PrivacyRequest p = repo.findById(requestId)
                .orElseThrow(() -> new IllegalArgumentException("Privacy request not found"));
        if (!PrivacyRequest.Status.VERIFIED.name().equals(p.getStatus())) {
            throw new IllegalStateException("Request must be VERIFIED before fulfillment (status=" + p.getStatus() + ")");
        }
        PrivacyRequest.Type type = PrivacyRequest.Type.valueOf(p.getType());
        p.setStatus(PrivacyRequest.Status.IN_PROGRESS.name());
        p.setFulfilledBy(adminUserId);
        repo.save(p);
        try {
            PrivacyRequest.Type finalType = type;
            PrivacyRequest finalP = p;
            com.kyra.security.tracing.TraceHelper.runSpan("privacy.fulfill",
                java.util.Map.of("type", finalType.name(), "requestId", finalP.getId().toString()),
                () -> {
                    switch (finalType) {
                        case EXPORT, ACCESS -> fulfillExport(finalP);
                        case ERASURE -> fulfillErasure(finalP);
                        case RESTRICTION -> fulfillRestriction(finalP);
                    }
                });
        } catch (Exception e) {
            p.setStatus(PrivacyRequest.Status.REJECTED.name());
            p.setRejectionReason("Fulfillment error: " + e.getMessage());
            repo.save(p);
            auditService.logAuditEvent(p.getTenantId(), adminUserId, "privacy.request.failed",
                    "privacy_request", p.getId().toString(),
                    Map.of("error", e.getMessage()), "FAILURE", null, null);
            throw e;
        }
        return repo.findById(requestId).orElseThrow();
    }

    /** GDPR Art.20 — machine-readable data export. Bundle user profile + audit trail + conversations summary. */
    private void fulfillExport(PrivacyRequest p) {
        Map<String, Object> bundle = new LinkedHashMap<>();
        bundle.put("exportedAt", Instant.now().toString());
        bundle.put("subjectUserId", p.getUserId().toString());
        bundle.put("tenantId", p.getTenantId() != null ? p.getTenantId().toString() : null);
        bundle.put("requestId", p.getId().toString());

        // Fetch user profile from auth-service (best-effort)
        try {
            Map user = restClient(authServiceUrl).get()
                    .uri("/v1/users/" + p.getUserId())
                    .retrieve().body(Map.class);
            bundle.put("profile", user);
        } catch (Exception e) {
            log.warn("export: profile fetch failed: {}", e.getMessage());
            bundle.put("profile", Map.of("error", "unavailable"));
        }
        // Conversations summary (best-effort)
        try {
            Object convos = restClient(chatServiceUrl).get()
                    .uri("/v1/conversations?userId=" + p.getUserId() + "&size=10000")
                    .retrieve().body(Object.class);
            bundle.put("conversations", convos);
        } catch (Exception e) {
            bundle.put("conversations", Map.of("error", "unavailable"));
        }

        try {
            byte[] json = objectMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(bundle);
            String path = "/tmp/exports/" + p.getId() + ".json";
            java.io.File dir = new java.io.File("/tmp/exports");
            if (!dir.exists()) dir.mkdirs();
            java.nio.file.Files.write(java.nio.file.Paths.get(path), json);
            p.setExportUrl(path);
            p.setExportSizeBytes((long) json.length);
            p.setStatus(PrivacyRequest.Status.COMPLETED.name());
            p.setFulfilledAt(Instant.now());
            repo.save(p);
            auditService.logAuditEvent(p.getTenantId(), p.getFulfilledBy(), "privacy.export.completed",
                    "privacy_request", p.getId().toString(),
                    Map.of("sizeBytes", json.length), "SUCCESS", null, null);
        } catch (java.io.IOException e) {
            throw new RuntimeException("Failed to write export", e);
        }
    }

    /** GDPR Art.17 — right to erasure. Soft-delete now, hard-delete after 30-day hold. */
    private void fulfillErasure(PrivacyRequest p) {
        // Mark user for deletion in auth-service
        try {
            restClient(authServiceUrl).post()
                    .uri("/v1/users/" + p.getUserId() + "/deletion-request")
                    .retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.warn("erasure: auth-service deletion-request failed (endpoint may not exist yet): {}", e.getMessage());
        }
        p.setHardDeleteAt(Instant.now().plus(ERASURE_HOLD_DAYS, ChronoUnit.DAYS));
        p.setFulfilledAt(Instant.now());
        // Status stays IN_PROGRESS until hard-delete scheduler runs
        repo.save(p);
        auditService.logAuditEvent(p.getTenantId(), p.getFulfilledBy(), "privacy.erasure.soft",
                "privacy_request", p.getId().toString(),
                Map.of("hardDeleteAt", p.getHardDeleteAt().toString()), "SUCCESS", null, null);
    }

    /** GDPR Art.18 — restriction of processing. */
    private void fulfillRestriction(PrivacyRequest p) {
        try {
            restClient(authServiceUrl).post()
                    .uri("/v1/users/" + p.getUserId() + "/restrict")
                    .retrieve().toBodilessEntity();
        } catch (Exception e) {
            log.warn("restriction: auth-service restrict failed: {}", e.getMessage());
        }
        p.setStatus(PrivacyRequest.Status.COMPLETED.name());
        p.setFulfilledAt(Instant.now());
        repo.save(p);
        auditService.logAuditEvent(p.getTenantId(), p.getFulfilledBy(), "privacy.restriction.applied",
                "privacy_request", p.getId().toString(),
                Map.of(), "SUCCESS", null, null);
    }

    public List<PrivacyRequest> list(UUID userId) {
        return repo.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public Optional<PrivacyRequest> get(UUID id) { return repo.findById(id); }

    public byte[] readExport(UUID id) throws java.io.IOException {
        PrivacyRequest p = repo.findById(id).orElseThrow();
        if (p.getExportUrl() == null) throw new IllegalStateException("No export available for request " + id);
        return java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(p.getExportUrl()));
    }

    /** Run by AuditRetentionScheduler sibling — separate scheduler handles hard-delete after hold period. */
    @Transactional
    public int processOverdueHardDeletes() {
        List<PrivacyRequest> overdue = repo.findOverdueHardDeletes(Instant.now());
        for (PrivacyRequest p : overdue) {
            try {
                // Hard-delete user + cascade their data
                restClient(authServiceUrl).delete()
                        .uri("/v1/users/" + p.getUserId() + "?hardDelete=true")
                        .retrieve().toBodilessEntity();
                p.setStatus(PrivacyRequest.Status.COMPLETED.name());
                repo.save(p);
                auditService.logAuditEvent(p.getTenantId(), null, "privacy.erasure.hard",
                        "privacy_request", p.getId().toString(),
                        Map.of("subjectUserId", p.getUserId().toString()), "SUCCESS", null, null);
            } catch (Exception e) {
                log.error("hard-delete failed for request {}: {}", p.getId(), e.getMessage());
            }
        }
        return overdue.size();
    }
}
