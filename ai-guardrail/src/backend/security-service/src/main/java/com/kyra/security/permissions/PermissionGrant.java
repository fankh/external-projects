package com.kyra.security.permissions;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "permission_grants")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PermissionGrant {

    public enum SubjectType { USER, ROLE, TENANT, GLOBAL }
    public enum Effect { ALLOW, DENY }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id") private UUID tenantId;
    @Column(name = "subject_type", nullable = false) private String subjectType;
    @Column(name = "subject_id") private String subjectId;       // UUID or role-name or null(global)
    @Column(name = "resource_type", nullable = false) private String resourceType;
    @Column(name = "resource_id") private String resourceId;     // null = wildcard
    @Column(nullable = false) private String action;
    @Column(nullable = false) @Builder.Default private String effect = "ALLOW";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> conditions;

    @Column(columnDefinition = "TEXT") private String description;
    @Column(name = "created_by") private UUID createdBy;
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) @Builder.Default private Instant updatedAt = Instant.now();

    @PreUpdate protected void onUpdate() { this.updatedAt = Instant.now(); }
}
