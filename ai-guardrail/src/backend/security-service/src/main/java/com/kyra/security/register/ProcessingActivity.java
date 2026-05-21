package com.kyra.security.register;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "processing_activities")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ProcessingActivity {

    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id") private UUID tenantId;
    @Column(nullable = false) private String name;
    @Column(columnDefinition = "TEXT") private String description;
    @Column(nullable = false, columnDefinition = "TEXT") private String purpose;
    @Column(name = "legal_basis", nullable = false) private String legalBasis;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "data_categories", columnDefinition = "text[]")
    private List<String> dataCategories;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "data_subject_categories", columnDefinition = "text[]")
    private List<String> dataSubjectCategories;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]")
    private List<String> recipients;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(name = "third_country_transfers", columnDefinition = "text[]")
    private List<String> thirdCountryTransfers;

    @Column(name = "retention_period_days") private Integer retentionPeriodDays;
    @Column(name = "security_measures", columnDefinition = "TEXT") private String securityMeasures;
    @Column(name = "dpo_contact") private String dpoContact;
    @Column(nullable = false) @Builder.Default private Boolean automated = Boolean.TRUE;
    @Column(name = "last_reviewed_at") private Instant lastReviewedAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", nullable = false) @Builder.Default private Instant createdAt = Instant.now();
    @Column(name = "updated_at", nullable = false) @Builder.Default private Instant updatedAt = Instant.now();

    @PreUpdate protected void onUpdate() { this.updatedAt = Instant.now(); }
}
