package com.kyra.common.audit;

import lombok.Builder;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Builder
public record AuditEvent(
        UUID userId,
        String action,
        String resourceType,
        String resourceId,
        Map<String, Object> details,
        String ipAddress,
        String status,
        Instant timestamp
) {
    public AuditEvent {
        if (timestamp == null) {
            timestamp = Instant.now();
        }
    }
}
