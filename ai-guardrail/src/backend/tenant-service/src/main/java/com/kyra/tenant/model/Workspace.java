package com.kyra.tenant.model;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name = "workspaces")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Workspace {
    @Id @GeneratedValue(strategy = GenerationType.UUID) private UUID id;
    
    @Column(name = "tenant_id", nullable = false) private java.util.UUID tenantId;
    @Column(nullable = false) private String name;
    @Column(nullable = false) private String slug;
    private String description;
    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) @Builder.Default private Instant updatedAt = Instant.now();
    @PreUpdate void onUpdate() { this.updatedAt = Instant.now(); }
}
