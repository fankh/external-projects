package com.kyra.branching.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BranchComparisonDTO {

    private BranchSummary branchA;
    private BranchSummary branchB;
    private UUID commonParentMessageId;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class BranchSummary {
        private UUID id;
        private String branchName;
        private String description;
        private Boolean isActive;
        private Integer messageCount;
        private LocalDateTime createdAt;
    }
}
