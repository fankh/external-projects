package com.kyra.analytics.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_usage_current")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserUsageCurrent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "user_id", nullable = false, unique = true)
    private UUID userId;

    @Builder.Default
    @Column(name = "queries_today", nullable = false)
    private Integer queriesToday = 0;

    @Builder.Default
    @Column(name = "tokens_today", nullable = false)
    private Long tokensToday = 0L;

    @Builder.Default
    @Column(name = "queries_this_hour", nullable = false)
    private Integer queriesThisHour = 0;

    @Builder.Default
    @Column(name = "tokens_this_hour", nullable = false)
    private Long tokensThisHour = 0L;

    @Column(name = "last_query_at")
    private Instant lastQueryAt;

    @Column(name = "hour_reset_at")
    private Instant hourResetAt;

    @Column(name = "day_reset_at")
    private Instant dayResetAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
