package com.kyra.security.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.kyra.security.dto.SecurityEventDTO;
import com.kyra.security.model.AuditLog;
import com.kyra.security.model.SecurityEvent;
import com.kyra.security.repository.AuditLogRepository;
import com.kyra.security.repository.SecurityEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuditService {

    private final AuditLogRepository auditLogRepository;
    private final SecurityEventRepository securityEventRepository;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private org.springframework.context.ApplicationEventPublisher eventPublisher;
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    private com.kyra.security.metrics.ComplianceMetrics metrics;

    private static final ObjectMapper CANONICAL = new ObjectMapper()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, true);

    @Transactional
    public AuditLog logAuditEvent(UUID tenantId, UUID userId, String action, String resourceType,
                                   String resourceId, Map<String, Object> details,
                                   String status, String ipAddress, String userAgent) {
        // Find previous entry_hash for this tenant to link the chain
        String prevHash = auditLogRepository.findLatestEntryHash(tenantId).orElse(null);

        AuditLog entry = AuditLog.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .userId(userId)
                .action(action)
                .resourceType(resourceType)
                .resourceId(resourceId)
                .details(details)
                .status(status)
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .prevHash(prevHash)
                .legalHold(Boolean.FALSE)
                .build();
        entry.setEntryHash(computeEntryHash(entry));
        AuditLog saved = auditLogRepository.save(entry);
        if (metrics != null) metrics.auditChainWritten();
        if (eventPublisher != null) eventPublisher.publishEvent(new com.kyra.security.siem.SiemExporter.AuditEvent(saved));
        return saved;
    }

    // Legacy signature (no tenantId) — defaults to system tenant (null)
    public AuditLog logAuditEvent(UUID userId, String action, String resourceType,
                                   String resourceId, Map<String, Object> details,
                                   String status, String ipAddress, String userAgent) {
        return logAuditEvent(null, userId, action, resourceType, resourceId, details, status, ipAddress, userAgent);
    }

    public AuditLog logAuditEvent(UUID userId, String action, String resourceType,
                                   String resourceId, Map<String, Object> details) {
        return logAuditEvent(null, userId, action, resourceType, resourceId, details, "SUCCESS", null, null);
    }

    private String computeEntryHash(AuditLog e) {
        // Build a canonical representation. Details is embedded as its canonical JSON string so
        // that round-trips through JSONB (which may change the underlying Map implementation) dont
        // change the hash. All map values are written with ORDER_MAP_ENTRIES_BY_KEYS.
        Map<String, Object> canonical = new TreeMap<>();
        canonical.put("id", e.getId() != null ? e.getId().toString() : null);
        canonical.put("tenantId", e.getTenantId() != null ? e.getTenantId().toString() : null);
        canonical.put("userId", e.getUserId() != null ? e.getUserId().toString() : null);
        canonical.put("action", e.getAction());
        canonical.put("resourceType", e.getResourceType());
        canonical.put("resourceId", e.getResourceId());
        canonical.put("status", e.getStatus());
        canonical.put("ipAddress", e.getIpAddress());
        canonical.put("userAgent", e.getUserAgent());
        canonical.put("prevHash", e.getPrevHash());
        try {
            String detailsJson = e.getDetails() == null ? "null" : CANONICAL.writeValueAsString(new TreeMap<>(e.getDetails()));
            canonical.put("details", detailsJson);
            String json = CANONICAL.writeValueAsString(canonical);
            return sha256Hex(json);
        } catch (JsonProcessingException ex) {
            throw new RuntimeException("Failed to canonicalize audit entry", ex);
        }
    }

    private static String sha256Hex(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] bytes = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(64);
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Walk the audit chain for a tenant between [from, to], recomputing each entry_hash
     * and comparing to stored value. Returns list of broken entry ids (empty = chain OK).
     */
    public Map<String, Object> verifyChain(UUID tenantId, Instant from, Instant to) {
        List<AuditLog> chain = auditLogRepository.findChain(tenantId,
                from != null ? from : Instant.EPOCH,
                to != null ? to : Instant.now());
        List<UUID> broken = new ArrayList<>();
        String expectedPrev = null;
        int checked = 0;
        for (AuditLog e : chain) {
            checked++;
            // Link check: prev_hash of this row must match entry_hash of previous row in the chain.
            if (!Objects.equals(e.getPrevHash(), expectedPrev)) {
                broken.add(e.getId());
            }
            // Hash check: recomputed entry_hash must match stored value.
            String recomputed = computeEntryHash(e);
            if (!Objects.equals(recomputed, e.getEntryHash())) {
                // Tolerate pre-V014 genesis rows where entry_hash was backfilled as sha256(id::text).
                if (e.getPrevHash() == null && Objects.equals(e.getEntryHash(), sha256Hex(e.getId().toString()))) {
                    // legitimate backfill genesis — skip
                } else if (!broken.contains(e.getId())) {
                    broken.add(e.getId());
                }
            }
            expectedPrev = e.getEntryHash();
        }
        return Map.of(
                "verified", broken.isEmpty(),
                "checkedCount", checked,
                "brokenIds", broken
        );
    }

    @Transactional
    public void setLegalHold(UUID auditLogId, boolean hold) {
        AuditLog e = auditLogRepository.findById(auditLogId)
                .orElseThrow(() -> new IllegalArgumentException("Audit log not found: " + auditLogId));
        // Toggling legal_hold itself bypasses the guard because the trigger only blocks when OLD.legal_hold=TRUE.
        // To release a hold we must do it via a direct UPDATE that the trigger allows (OLD.legal_hold=TRUE blocks everything).
        // Workaround: drop and re-insert? Too invasive. Instead, legal_hold release is an admin-only DB op via psql for now.
        if (Boolean.TRUE.equals(e.getLegalHold()) && !hold) {
            throw new IllegalStateException("Releasing legal hold requires direct DBA intervention (trigger-protected)");
        }
        e.setLegalHold(hold);
        auditLogRepository.save(e);
    }

    public Page<SecurityEventDTO> getSecurityEvents(Pageable pageable) {
        return securityEventRepository.findAll(pageable).map(SecurityEventDTO::fromEntity);
    }

    public Page<SecurityEventDTO> getSecurityEventsByUser(UUID userId, Pageable pageable) {
        return securityEventRepository.findByUserId(userId, pageable).map(SecurityEventDTO::fromEntity);
    }

    public Page<SecurityEventDTO> getSecurityEventsByType(SecurityEvent.EventType eventType, Pageable pageable) {
        return securityEventRepository.findByEventType(eventType, pageable).map(SecurityEventDTO::fromEntity);
    }

    public List<SecurityEventDTO> getUnreviewedEvents() {
        return securityEventRepository.findByReviewedFalse().stream()
                .map(SecurityEventDTO::fromEntity)
                .collect(Collectors.toList());
    }

    public Page<AuditLog> getAuditLogs(Pageable pageable) {
        return auditLogRepository.findAll(pageable);
    }

    public Page<AuditLog> getAuditLogsByUser(UUID userId, Pageable pageable) {
        return auditLogRepository.findByUserId(userId, pageable);
    }

    public List<AuditLog> exportAuditLogs(Instant start, Instant end) {
        return auditLogRepository.findByCreatedAtBetween(start, end);
    }

    public Map<String, Object> getSecurityDashboard() {
        List<SecurityEvent> recentEvents = securityEventRepository.findAll();
        long totalEvents = recentEvents.size();
        long unreviewedCount = securityEventRepository.findByReviewedFalse().size();
        Map<SecurityEvent.EventType, Long> eventsByType = recentEvents.stream()
                .collect(Collectors.groupingBy(SecurityEvent::getEventType, Collectors.counting()));
        Map<String, Long> severityCounts = recentEvents.stream()
                .collect(Collectors.groupingBy(e -> e.getSeverity().name(), Collectors.counting()));
        return Map.of(
                "totalEvents", totalEvents,
                "unreviewedEvents", unreviewedCount,
                "eventsByType", eventsByType,
                "severityDistribution", severityCounts,
                "generatedAt", Instant.now().toString()
        );
    }

    public String exportAuditLogsAsCsv(Instant start, Instant end) {
        List<AuditLog> logs = exportAuditLogs(start, end);
        StringBuilder csv = new StringBuilder();
        csv.append("id,userId,action,resourceType,resourceId,status,ipAddress,entryHash,legalHold,createdAt\n");
        for (AuditLog l : logs) {
            csv.append(String.format("%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n",
                    l.getId(), l.getUserId(),
                    escapeCsv(l.getAction()), escapeCsv(l.getResourceType()),
                    escapeCsv(l.getResourceId()), escapeCsv(l.getStatus()),
                    escapeCsv(l.getIpAddress()),
                    l.getEntryHash(), l.getLegalHold(), l.getCreatedAt()));
        }
        return csv.toString();
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
