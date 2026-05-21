package com.kyra.agent.dto;

import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApproveRequest {

    @NotNull(message = "approved flag is required")
    private Boolean approved;

    private UUID reviewedBy;

    private String reviewNote;
}
