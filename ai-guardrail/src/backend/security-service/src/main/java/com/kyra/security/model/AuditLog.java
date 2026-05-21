package com.kyra.security.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    @Id
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    private UUID sessionId;

    private String ipAddress;

    private String userAgent;

    @Column(nullable = false)
    private String action;

    private String resourceType;

    private String resourceId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> details;

    private String status;

    @Column(columnDefinition = "TEXT")
    private String errorMessage;


    // tenant_id (added V008)
    private UUID tenantId;

    // immutability chain (added V014)
    @Column(length = 64)
    private String prevHash;

    @Column(length = 64)
    private String entryHash;

    @Column(nullable = false)
    private Boolean legalHold;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;
}
