package com.kyra.agent.dto;

import com.kyra.agent.model.AgentConfig;
import lombok.*;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AgentConfigDTO {

    private UUID id;
    private String name;
    private String agentType;
    private String description;
    private String systemPrompt;
    private List<String> allowedTools;
    private Integer maxSteps;
    private Integer timeoutSeconds;
    private Boolean requiresApproval;
    private Boolean isActive;
    private Instant createdAt;
    private Instant updatedAt;

    public static AgentConfigDTO fromEntity(AgentConfig entity) {
        return AgentConfigDTO.builder()
                .id(entity.getId())
                .name(entity.getName())
                .agentType(entity.getAgentType().name())
                .description(entity.getDescription())
                .systemPrompt(entity.getSystemPrompt())
                .allowedTools(entity.getAllowedTools())
                .maxSteps(entity.getMaxSteps())
                .timeoutSeconds(entity.getTimeoutSeconds())
                .requiresApproval(entity.getRequiresApproval())
                .isActive(entity.getIsActive())
                .createdAt(entity.getCreatedAt())
                .updatedAt(entity.getUpdatedAt())
                .build();
    }
}
