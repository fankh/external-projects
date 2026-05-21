package com.kyra.agent.controller;

import com.kyra.agent.dto.*;
import com.kyra.agent.model.AgentApproval;
import com.kyra.agent.model.AgentConfig;
import com.kyra.agent.model.AgentExecution;
import com.kyra.agent.model.ExecutionStep;
import com.kyra.agent.repository.AgentConfigRepository;
import com.kyra.agent.repository.AgentExecutionRepository;
import com.kyra.agent.repository.ExecutionStepRepository;
import com.kyra.agent.service.AgentOrchestrator;
import com.kyra.agent.service.ApprovalService;
import com.kyra.agent.service.ToolRegistry;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/agents")
@RequiredArgsConstructor
@Slf4j
public class AgentController {

    private final AgentConfigRepository configRepository;
    private final AgentExecutionRepository executionRepository;
    private final ExecutionStepRepository stepRepository;
    private final AgentOrchestrator orchestrator;
    private final ApprovalService approvalService;
    private final ToolRegistry toolRegistry;

    // ------------------------------------------------------------------
    // Agent Configs
    // ------------------------------------------------------------------

    @GetMapping
    public ResponseEntity<List<AgentConfigDTO>> listAgents() {
        List<AgentConfigDTO> configs = configRepository.findByIsActiveTrue().stream()
                .map(AgentConfigDTO::fromEntity)
                .collect(Collectors.toList());
        return ResponseEntity.ok(configs);
    }

    @GetMapping("/{id}/config")
    public ResponseEntity<AgentConfigDTO> getConfig(@PathVariable UUID id) {
        AgentConfig config = configRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Agent config not found: " + id));
        return ResponseEntity.ok(AgentConfigDTO.fromEntity(config));
    }

    // ------------------------------------------------------------------
    // Executions
    // ------------------------------------------------------------------

    @PostMapping("/executions")
    public ResponseEntity<ExecutionDTO> createExecution(@Valid @RequestBody CreateExecutionRequest request,
                                                         @RequestHeader(value = "X-User-Id", required = false) String userIdHeader) {
        UUID userId = userIdHeader != null ? UUID.fromString(userIdHeader) : UUID.randomUUID();
        log.info("Create execution request from user {} for agent {}", userId, request.getAgentId());

        AgentExecution execution = orchestrator.createExecution(request, userId);
        return ResponseEntity.ok(ExecutionDTO.fromEntitySummary(execution));
    }

    @GetMapping("/executions/{id}")
    public ResponseEntity<ExecutionDTO> getExecution(@PathVariable UUID id) {
        AgentExecution execution = executionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + id));
        return ResponseEntity.ok(ExecutionDTO.fromEntity(execution));
    }

    @PostMapping("/executions/{id}/cancel")
    public ResponseEntity<ExecutionDTO> cancelExecution(@PathVariable UUID id) {
        log.info("Cancel execution request: {}", id);
        AgentExecution execution = orchestrator.cancelExecution(id);
        return ResponseEntity.ok(ExecutionDTO.fromEntitySummary(execution));
    }

    @GetMapping("/executions")
    public ResponseEntity<Page<ExecutionDTO>> listExecutions(
            @RequestHeader(value = "X-User-Id", required = false) String userIdHeader,
            @PageableDefault(size = 20) Pageable pageable) {
        if (userIdHeader != null) {
            UUID userId = UUID.fromString(userIdHeader);
            Page<ExecutionDTO> page = executionRepository.findByUserId(userId, pageable)
                    .map(ExecutionDTO::fromEntitySummary);
            return ResponseEntity.ok(page);
        }
        Page<ExecutionDTO> page = executionRepository.findAll(pageable)
                .map(ExecutionDTO::fromEntitySummary);
        return ResponseEntity.ok(page);
    }

    // ------------------------------------------------------------------
    // Approvals
    // ------------------------------------------------------------------

    @PostMapping("/approvals/{id}")
    public ResponseEntity<ApprovalDTO> approveOrReject(@PathVariable UUID id,
                                                        @Valid @RequestBody ApproveRequest request) {
        log.info("Approval decision for {}: approved={}", id, request.getApproved());
        AgentApproval approval = approvalService.processApproval(id, request);

        // If approved, resume execution
        if (approval.getStatus() == AgentApproval.ApprovalStatus.approved) {
            orchestrator.resumeAfterApproval(approval.getExecution().getId());
        } else {
            // Rejected -- fail the execution
            AgentExecution execution = approval.getExecution();
            execution.setStatus(AgentExecution.ExecutionStatus.failed);
            execution.setErrorMessage("Step rejected: " + (request.getReviewNote() != null ? request.getReviewNote() : "No reason provided"));
            executionRepository.save(execution);
        }

        return ResponseEntity.ok(ApprovalDTO.fromEntity(approval));
    }

    // ------------------------------------------------------------------
    // Audit
    // ------------------------------------------------------------------

    @GetMapping("/executions/{id}/audit")
    public ResponseEntity<Map<String, Object>> getAuditLog(@PathVariable UUID id) {
        AgentExecution execution = executionRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + id));

        List<ExecutionStep> steps = stepRepository.findByExecutionIdOrderByStepNumberAsc(id);

        List<Map<String, Object>> auditEntries = new ArrayList<>();

        // Execution-level events
        auditEntries.add(Map.of(
                "event", "execution_created",
                "timestamp", execution.getCreatedAt().toString(),
                "details", Map.of(
                        "agent", execution.getAgent().getName(),
                        "task", execution.getTaskDescription(),
                        "user_id", execution.getUserId().toString()
                )
        ));

        if (execution.getStartedAt() != null) {
            auditEntries.add(Map.of(
                    "event", "execution_started",
                    "timestamp", execution.getStartedAt().toString()
            ));
        }

        // Step-level events
        for (ExecutionStep step : steps) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("event", "step_" + step.getStatus().name());
            entry.put("timestamp", step.getCreatedAt().toString());
            entry.put("details", Map.of(
                    "step_number", step.getStepNumber(),
                    "tool", step.getToolName(),
                    "duration_ms", step.getDurationMs() != null ? step.getDurationMs() : 0,
                    "status", step.getStatus().name()
            ));
            if (step.getErrorMessage() != null) {
                entry.put("error", step.getErrorMessage());
            }
            auditEntries.add(entry);
        }

        // Approval events
        for (var approval : execution.getApprovals()) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("event", "approval_" + approval.getStatus().name());
            entry.put("timestamp", approval.getCreatedAt().toString());
            entry.put("details", Map.of(
                    "action", approval.getActionDescription(),
                    "risk_level", approval.getRiskLevel(),
                    "status", approval.getStatus().name()
            ));
            if (approval.getReviewedAt() != null) {
                entry.put("reviewed_at", approval.getReviewedAt().toString());
                entry.put("reviewed_by", approval.getReviewedBy() != null ? approval.getReviewedBy().toString() : "unknown");
            }
            auditEntries.add(entry);
        }

        if (execution.getCompletedAt() != null) {
            auditEntries.add(Map.of(
                    "event", "execution_" + execution.getStatus().name(),
                    "timestamp", execution.getCompletedAt().toString()
            ));
        }

        return ResponseEntity.ok(Map.of(
                "execution_id", id.toString(),
                "agent", execution.getAgent().getName(),
                "status", execution.getStatus().name(),
                "audit_trail", auditEntries
        ));
    }
}
