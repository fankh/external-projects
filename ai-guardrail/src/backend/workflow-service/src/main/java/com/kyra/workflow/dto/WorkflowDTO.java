package com.kyra.workflow.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class WorkflowDTO {

    private UUID id;
    private String name;
    private String description;
    private String purposeId;
    private List<Map<String, Object>> steps;
    private Map<String, Object> inputSchema;
    private String outputFormat;
    private String status;
    private boolean isSystem;
    private UUID createdBy;
    private Instant createdAt;
    private Instant updatedAt;
}
