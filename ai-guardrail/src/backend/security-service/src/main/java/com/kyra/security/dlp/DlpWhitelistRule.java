package com.kyra.security.dlp;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name = "dlp_whitelist_rules")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DlpWhitelistRule {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    @Column(name = "tenant_id") private UUID tenantId;
    @Column(name = "pattern_id") private UUID patternId;
    @Column(name = "context_field", nullable = false) private String contextField;
    @Column(name = "context_value", nullable = false) private String contextValue;
    @Column(nullable = false) @Builder.Default private String effect = "ALLOW";
    private String description;
    @Column(name = "is_active", nullable = false) @Builder.Default private Boolean isActive = true;
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
}
