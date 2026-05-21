package com.kyra.security.keys;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "tenant_keys")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class TenantKey {

    public enum State { ACTIVE, PENDING_DEACTIVATION, DEACTIVATED }

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false) private UUID tenantId;
    @Column(name = "key_alias", nullable = false) private String keyAlias;
    @Column(name = "key_version", nullable = false) @Builder.Default private Integer keyVersion = 1;
    @Column(nullable = false) @Builder.Default private String algorithm = "AES-256-GCM";
    @Column(nullable = false) @Builder.Default private String state = "ACTIVE";
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @Column(name = "activated_at", nullable = false) @Builder.Default private Instant activatedAt = Instant.now();
    @Column(name = "deactivated_at") private Instant deactivatedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;
}
