package com.kyra.workflow.controller;

import com.kyra.workflow.dto.*;
import com.kyra.workflow.model.Workflow;
import com.kyra.workflow.model.WorkflowExecution;
import com.kyra.workflow.repository.WorkflowExecutionRepository;
import com.kyra.workflow.repository.WorkflowRepository;
import com.kyra.workflow.service.WorkflowEngine;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@RestController
@RequestMapping("/v1/workflows")
@RequiredArgsConstructor
public class WorkflowController {

    private final WorkflowRepository workflowRepository;
    private final WorkflowExecutionRepository executionRepository;
    private final WorkflowEngine workflowEngine;

    @GetMapping
    public ResponseEntity<List<WorkflowDTO>> listWorkflows(
            @RequestParam(required = false) String purposeId) {
        List<Workflow> workflows;
        if (purposeId != null && !purposeId.isBlank()) {
            workflows = workflowRepository.findByPurposeId(purposeId);
        } else {
            workflows = workflowRepository.findAll();
        }
        List<WorkflowDTO> dtos = workflows.stream().map(this::toDTO).toList();
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/{id}")
    public ResponseEntity<WorkflowDTO> getWorkflow(@PathVariable UUID id) {
        Workflow workflow = workflowRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Workflow not found: " + id));
        return ResponseEntity.ok(toDTO(workflow));
    }

    @PostMapping
    public ResponseEntity<WorkflowDTO> createWorkflow(@Valid @RequestBody WorkflowDTO request,
                                                       Authentication authentication) {
        Workflow workflow = Workflow.builder()
                .name(request.getName())
                .description(request.getDescription())
                .purposeId(request.getPurposeId())
                .steps(request.getSteps() != null ? request.getSteps() : List.of())
                .inputSchema(request.getInputSchema() != null ? request.getInputSchema() : java.util.Map.of())
                .outputFormat(request.getOutputFormat() != null ? request.getOutputFormat() : "markdown")
                .status(Workflow.WorkflowStatus.draft)
                .isSystem(false)
                .createdBy(getUserId(authentication))
                .build();

        workflow = workflowRepository.save(workflow);
        return ResponseEntity.status(HttpStatus.CREATED).body(toDTO(workflow));
    }

    @PostMapping("/{id}/execute")
    public ResponseEntity<WorkflowResultDTO> executeWorkflow(
            @PathVariable UUID id,
            @Valid @RequestBody ExecuteWorkflowRequest request,
            Authentication authentication) {
        UUID userId = getUserId(authentication);
        WorkflowResultDTO result = workflowEngine.execute(id, userId, request.getInput());
        return ResponseEntity.ok(result);
    }

    @GetMapping("/executions/{id}")
    public ResponseEntity<WorkflowExecutionDTO> getExecution(@PathVariable UUID id) {
        WorkflowExecution execution = executionRepository.findById(id)
                .orElseThrow(() -> new NoSuchElementException("Execution not found: " + id));
        return ResponseEntity.ok(toExecutionDTO(execution));
    }

    @GetMapping("/executions")
    public ResponseEntity<List<WorkflowExecutionDTO>> listExecutions(Authentication authentication) {
        UUID userId = getUserId(authentication);
        List<WorkflowExecution> executions = executionRepository.findByUserIdOrderByCreatedAtDesc(userId);
        List<WorkflowExecutionDTO> dtos = executions.stream().map(this::toExecutionDTO).toList();
        return ResponseEntity.ok(dtos);
    }

    private UUID getUserId(Authentication authentication) {
        if (authentication != null && authentication.getName() != null) {
            try {
                return UUID.fromString(authentication.getName());
            } catch (IllegalArgumentException e) {
                // principal is not a UUID
            }
        }
        return null;
    }

    private WorkflowDTO toDTO(Workflow w) {
        return WorkflowDTO.builder()
                .id(w.getId())
                .name(w.getName())
                .description(w.getDescription())
                .purposeId(w.getPurposeId())
                .steps(w.getSteps())
                .inputSchema(w.getInputSchema())
                .outputFormat(w.getOutputFormat())
                .status(w.getStatus().name())
                .isSystem(w.isSystem())
                .createdBy(w.getCreatedBy())
                .createdAt(w.getCreatedAt())
                .updatedAt(w.getUpdatedAt())
                .build();
    }

    private WorkflowExecutionDTO toExecutionDTO(WorkflowExecution e) {
        return WorkflowExecutionDTO.builder()
                .id(e.getId())
                .workflowId(e.getWorkflowId())
                .userId(e.getUserId())
                .input(e.getInput())
                .output(e.getOutput())
                .status(e.getStatus().name())
                .currentStep(e.getCurrentStep())
                .stepResults(e.getStepResults())
                .errorMessage(e.getErrorMessage())
                .startedAt(e.getStartedAt())
                .completedAt(e.getCompletedAt())
                .durationMs(e.getDurationMs())
                .createdAt(e.getCreatedAt())
                .build();
    }
}
