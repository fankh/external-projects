package com.kyra.security.flags;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "feature_flags")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class FeatureFlag {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(nullable = false, unique = true) private String key;
    private String description;
    @Column(nullable = false) @Builder.Default private Boolean enabled = false;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "tenant_overrides", columnDefinition = "jsonb")
    private Map<String, Boolean> tenantOverrides;
    private Integer percentage;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String, Object> metadata;
    @Column(name = "updated_at", nullable = false) @Builder.Default private Instant updatedAt = Instant.now();
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @PreUpdate void onUpdate() { this.updatedAt = Instant.now(); }
}
