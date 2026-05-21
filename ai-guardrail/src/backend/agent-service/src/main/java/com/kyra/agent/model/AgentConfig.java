package com.kyra.agent.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "agent_configs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AgentConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "agent_type", nullable = false, columnDefinition = "agent_type")
    private AgentType agentType;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(columnDefinition = "TEXT")
    private String systemPrompt;

    @Column(name = "allowed_tools", columnDefinition = "TEXT[]")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.ARRAY)
    @Builder.Default
    private List<String> allowedTools = List.of();

    @Builder.Default
    @Column(nullable = false)
    private Integer maxSteps = 10;

    @Builder.Default
    @Column(nullable = false)
    private Integer timeoutSeconds = 300;

    @Builder.Default
    @Column(nullable = false)
    private Boolean requiresApproval = false;

    @Builder.Default
    @Column(nullable = false)
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    private Instant updatedAt;

    public enum AgentType {
        conversational, task_executor, workflow_runner, background, scheduled
    }
}
