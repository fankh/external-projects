package com.kyra.security.privacy;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "privacy_requests")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PrivacyRequest {

    public enum Type { EXPORT, ERASURE, RESTRICTION, ACCESS }
    public enum Status {
        PENDING_VERIFICATION, VERIFIED, IN_PROGRESS, COMPLETED, REJECTED, CANCELLED
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id") private UUID tenantId;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(nullable = false) private String type;
    @Column(nullable = false) @Builder.Default private String status = "PENDING_VERIFICATION";
    @Column(name = "requested_by") private UUID requestedBy;
    @Column(name = "verification_notes", columnDefinition = "TEXT") private String verificationNotes;
    @Column(name = "verified_by") private UUID verifiedBy;
    @Column(name = "verified_at") private Instant verifiedAt;
    @Column(name = "fulfilled_by") private UUID fulfilledBy;
    @Column(name = "fulfilled_at") private Instant fulfilledAt;
    @Column(name = "sla_deadline_at", nullable = false) private Instant slaDeadlineAt;
    @Column(name = "hard_delete_at") private Instant hardDeleteAt;
    @Column(name = "export_url", columnDefinition = "TEXT") private String exportUrl;
    @Column(name = "export_size_bytes") private Long exportSizeBytes;
    @Column(name = "rejection_reason", columnDefinition = "TEXT") private String rejectionReason;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) @Builder.Default private Instant updatedAt = Instant.now();

    @PreUpdate protected void onUpdate() { this.updatedAt = Instant.now(); }
}
