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
public class BranchDTO {

    private UUID id;
    private UUID conversationId;
    private UUID parentMessageId;
    private String branchName;
    private String description;
    private Boolean isActive;
    private UUID createdBy;
    private UUID firstMessageId;
    private Integer messageCount;
    private LocalDateTime createdAt;
}
