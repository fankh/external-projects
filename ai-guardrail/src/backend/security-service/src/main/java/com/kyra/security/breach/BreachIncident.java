package com.kyra.security.breach;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "breach_incidents")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class BreachIncident {

    public enum Severity { LOW, MEDIUM, HIGH, CRITICAL }
    public enum Category { CONFIDENTIALITY, INTEGRITY, AVAILABILITY }
    public enum Status { OPEN, UNDER_INVESTIGATION, NOTIFIED, CLOSED }

    @Id
    private UUID id;

    @Column(name = "tenant_id") private UUID tenantId;
    @Column(name = "detected_at", nullable = false) private Instant detectedAt;
    @Column(name = "reported_by") private UUID reportedBy;
    @Column(nullable = false) private String severity;
    @Column(nullable = false) private String category;
    @Column(name = "affected_record_count", nullable = false) @Builder.Default private Integer affectedRecordCount = 0;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "affected_data_categories", columnDefinition = "text[]")
    private List<String> affectedDataCategories;

    @Column(nullable = false, columnDefinition = "TEXT") private String description;
    @Column(name = "root_cause", columnDefinition = "TEXT") private String rootCause;
    @Column(name = "containment_actions", columnDefinition = "TEXT") private String containmentActions;
    @Column(name = "high_risk_to_subjects", nullable = false) @Builder.Default private Boolean highRiskToSubjects = Boolean.FALSE;
    @Column(name = "authority_deadline_at", nullable = false) private Instant authorityDeadlineAt;
    @Column(name = "authority_notified_at") private Instant authorityNotifiedAt;
    @Column(name = "authority_notification_ref") private String authorityNotificationRef;
    @Column(name = "subjects_notified_at") private Instant subjectsNotifiedAt;
    @Column(name = "subjects_notification_count") private Integer subjectsNotificationCount;
    @Column(nullable = false) @Builder.Default private String status = "OPEN";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) @Builder.Default private Instant updatedAt = Instant.now();

    @PreUpdate protected void onUpdate() { this.updatedAt = Instant.now(); }
}
