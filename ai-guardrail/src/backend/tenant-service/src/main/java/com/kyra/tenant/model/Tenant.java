package com.kyra.tenant.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "tenants")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Tenant {

    public enum TenantStatus {
        trial, active, suspended, cancelled
    }

    public enum TenantTier {
        starter, professional, enterprise
    }

    public enum IsolationLevel {
        row, schema, database
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false, unique = true, length = 100)
    private String slug;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "tenant_tier")
    @Builder.Default
    private TenantTier tier = TenantTier.starter;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, columnDefinition = "tenant_status")
    @Builder.Default
    private TenantStatus status = TenantStatus.trial;

    @Enumerated(EnumType.STRING)
    @Column(name = "isolation_level", nullable = false, columnDefinition = "isolation_level")
    @Builder.Default
    private IsolationLevel isolationLevel = IsolationLevel.row;

    @Column(name = "owner_id")
    private UUID ownerId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> settings = Map.of(
            "timezone", "UTC",
            "locale", "en",
            "sessionTimeout", 3600,
            "mfaRequired", false
    );

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> features = Map.of(
            "ragEnabled", true,
            "memoryEnabled", true,
            "streamingEnabled", true,
            "multiModalEnabled", false,
            "agentsEnabled", false
    );

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> limits = Map.of(
            "maxUsers", 10,
            "maxStorage", 10737418240L,
            "maxQueriesPerDay", 1000
    );

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> branding = Map.of(
            "primaryColor", "#3B82F6",
            "appName", "KYRA"
    );

    @Column(name = "custom_domain")
    private String customDomain;

    @Column(name = "encryption_key_id")
    private String encryptionKeyId;

    @Column(name = "trial_ends_at")
    private Instant trialEndsAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at", nullable = false)
    @Builder.Default
    private Instant updatedAt = Instant.now();

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = Instant.now();
    }
}
