package com.kyra.analytics.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrackUsageRequest {

    @NotNull(message = "User ID must not be null")
    private UUID userId;

    private UUID personaId;

    private UUID purposeId;

    @Builder.Default
    private int queryCount = 1;

    @Builder.Default
    private long promptTokens = 0;

    @Builder.Default
    private long completionTokens = 0;
}
