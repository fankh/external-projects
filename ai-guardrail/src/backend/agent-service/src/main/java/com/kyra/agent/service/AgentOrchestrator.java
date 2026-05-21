package com.kyra.agent.service;

import com.kyra.agent.client.MLPlanningClient;
import com.kyra.agent.dto.CreateExecutionRequest;
import com.kyra.agent.model.AgentApproval;
import com.kyra.agent.model.AgentConfig;
import com.kyra.agent.model.AgentExecution;
import com.kyra.agent.model.AgentExecution.ExecutionStatus;
import com.kyra.agent.model.ExecutionStep;
import com.kyra.agent.repository.AgentConfigRepository;
import com.kyra.agent.repository.AgentExecutionRepository;
import com.kyra.agent.repository.ExecutionStepRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class AgentOrchestrator {

    private final AgentConfigRepository configRepository;
    private final AgentExecutionRepository executionRepository;
    private final ExecutionStepRepository stepRepository;
    private final MLPlanningClient planningClient;
    private final ToolRegistry toolRegistry;
    private final ApprovalService approvalService;

    private static final int MAX_RETRIES = 2;

    /**
     * Create a new execution and kick off planning asynchronously.
     */
    @Transactional
    public AgentExecution createExecution(CreateExecutionRequest request, UUID userId) {
        AgentConfig config = configRepository.findById(request.getAgentId())
                .orElseThrow(() -> new IllegalArgumentException("Agent config not found: " + request.getAgentId()));

        if (!config.getIsActive()) {
            throw new IllegalStateException("Agent is not active: " + config.getName());
        }

        AgentExecution execution = AgentExecution.builder()
                .agent(config)
                .userId(userId)
                .taskDescription(request.getTaskDescription())
                .parameters(request.getParameters() != null ? request.getParameters() : Map.of())
                .status(ExecutionStatus.pending)
                .build();

        execution = executionRepository.save(execution);
        log.info("Created execution {} for agent {} user {}", execution.getId(), config.getName(), userId);

        // Start planning asynchronously
        startPlanning(execution.getId());

        return execution;
    }

    /**
     * Plan and execute the task asynchronously.
     */
    @Async
    public void startPlanning(UUID executionId) {
        AgentExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new IllegalStateException("Execution not found: " + executionId));

        try {
            // Phase 1: Planning
            execution.setStatus(ExecutionStatus.planning);
            execution.setStartedAt(Instant.now());
            executionRepository.save(execution);

            AgentConfig config = execution.getAgent();
            Map<String, Object> constraints = Map.of(
                    "max_steps", config.getMaxSteps(),
                    "timeout_seconds", config.getTimeoutSeconds(),
                    "requires_approval", config.getRequiresApproval()
            );

            Map<String, Object> plan = planningClient.generatePlan(
                    execution.getTaskDescription(),
                    config.getAllowedTools(),
                    constraints
            );

            execution.setPlan(plan);

            // Create execution steps from plan
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> planSteps = (List<Map<String, Object>>) plan.get("steps");
            if (planSteps == null || planSteps.isEmpty()) {
                throw new RuntimeException("Plan returned no steps");
            }

            execution.setTotalSteps(planSteps.size());
            executionRepository.save(execution);

            List<ExecutionStep> steps = new ArrayList<>();
            for (Map<String, Object> planStep : planSteps) {
                ExecutionStep step = ExecutionStep.builder()
                        .execution(execution)
                        .stepNumber(((Number) planStep.get("step_number")).intValue())
                        .toolName((String) planStep.get("tool_name"))
                        .toolInput(planStep.get("input_template") != null
                                ? asMap(planStep.get("input_template"))
                                : Map.of())
                        .status(ExecutionStatus.pending)
                        .build();
                steps.add(stepRepository.save(step));
            }

            log.info("Plan created for execution {} with {} steps", executionId, steps.size());

            // Phase 2: Execute steps sequentially
            executeSteps(execution, steps);

        } catch (Exception e) {
            log.error("Execution {} failed during planning: {}", executionId, e.getMessage(), e);
            execution.setStatus(ExecutionStatus.failed);
            execution.setErrorMessage("Planning failed: " + e.getMessage());
            execution.setCompletedAt(Instant.now());
            executionRepository.save(execution);
        }
    }

    /**
     * Execute steps sequentially, handling approvals and retries.
     */
    private void executeSteps(AgentExecution execution, List<ExecutionStep> steps) {
        execution.setStatus(ExecutionStatus.running);
        executionRepository.save(execution);

        for (ExecutionStep step : steps) {
            // Check if execution was cancelled
            AgentExecution current = executionRepository.findById(execution.getId()).orElse(null);
            if (current == null || current.getStatus() == ExecutionStatus.cancelled) {
                log.info("Execution {} was cancelled, stopping at step {}", execution.getId(), step.getStepNumber());
                return;
            }

            try {
                // Check if this tool requires approval
                boolean needsApproval = execution.getAgent().getRequiresApproval()
                        || toolRegistry.toolRequiresApproval(step.getToolName());

                if (needsApproval) {
                    String riskLevel = toolRegistry.toolRequiresApproval(step.getToolName()) ? "high" : "medium";
                    approvalService.createApprovalRequest(
                            execution, step,
                            String.format("Step %d: %s with tool '%s'",
                                    step.getStepNumber(), step.getToolInput(), step.getToolName()),
                            riskLevel
                    );

                    log.info("Execution {} paused at step {} awaiting approval",
                            execution.getId(), step.getStepNumber());
                    return; // Stop execution; will resume when approved
                }

                // Execute the step with retry
                executeStepWithRetry(execution, step);

            } catch (Exception e) {
                log.error("Execution {} failed at step {}: {}", execution.getId(), step.getStepNumber(), e.getMessage());
                step.setStatus(ExecutionStatus.failed);
                step.setErrorMessage(e.getMessage());
                stepRepository.save(step);

                execution.setStatus(ExecutionStatus.failed);
                execution.setErrorMessage(String.format("Step %d failed: %s", step.getStepNumber(), e.getMessage()));
                execution.setCompletedAt(Instant.now());
                executionRepository.save(execution);
                return;
            }

            // Update progress
            execution.setCurrentStep(step.getStepNumber());
            executionRepository.save(execution);
        }

        // All steps completed successfully
        execution.setStatus(ExecutionStatus.completed);
        execution.setCompletedAt(Instant.now());

        // Collect results from all steps
        Map<String, Object> combinedResult = new HashMap<>();
        for (ExecutionStep step : steps) {
            if (step.getToolOutput() != null) {
                combinedResult.put("step_" + step.getStepNumber(), step.getToolOutput());
            }
        }
        execution.setResult(combinedResult);
        executionRepository.save(execution);

        log.info("Execution {} completed successfully", execution.getId());
    }

    /**
     * Execute a single step with retry logic.
     */
    private void executeStepWithRetry(AgentExecution execution, ExecutionStep step) {
        int attempt = 0;
        Exception lastError = null;

        while (attempt <= MAX_RETRIES) {
            try {
                long startTime = System.currentTimeMillis();
                step.setStatus(ExecutionStatus.running);
                stepRepository.save(step);

                // Simulate tool execution - in production this would dispatch to actual tool implementations
                Map<String, Object> output = executeTool(step.getToolName(), step.getToolInput());

                long duration = System.currentTimeMillis() - startTime;
                step.setToolOutput(output);
                step.setStatus(ExecutionStatus.completed);
                step.setDurationMs((int) duration);
                stepRepository.save(step);

                log.info("Step {} of execution {} completed in {}ms",
                        step.getStepNumber(), execution.getId(), duration);
                return;

            } catch (Exception e) {
                lastError = e;
                attempt++;
                log.warn("Step {} attempt {}/{} failed: {}",
                        step.getStepNumber(), attempt, MAX_RETRIES + 1, e.getMessage());

                if (attempt <= MAX_RETRIES) {
                    try {
                        Thread.sleep(1000L * attempt); // Exponential backoff
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new RuntimeException("Interrupted during retry backoff", ie);
                    }
                }
            }
        }

        throw new RuntimeException("Step failed after " + (MAX_RETRIES + 1) + " attempts: " + lastError.getMessage(),
                lastError);
    }

    /**
     * Execute a tool by name. In production, this dispatches to actual tool service implementations.
     */
    private Map<String, Object> executeTool(String toolName, Map<String, Object> input) {
        ToolRegistry.ToolDefinition tool = toolRegistry.getTool(toolName)
                .orElseThrow(() -> new IllegalArgumentException("Unknown tool: " + toolName));

        // Tool execution is a placeholder -- each tool would have its own implementation
        // dispatching to the appropriate microservice or external API.
        log.info("Executing tool '{}' with input: {}", toolName, input);

        return Map.of(
                "tool", toolName,
                "status", "executed",
                "timestamp", Instant.now().toString(),
                "input_received", input
        );
    }

    /**
     * Resume execution after an approval has been granted.
     */
    @Async
    public void resumeAfterApproval(UUID executionId) {
        AgentExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new IllegalStateException("Execution not found: " + executionId));

        if (execution.getStatus() != ExecutionStatus.awaiting_approval) {
            log.warn("Execution {} is not awaiting approval, status={}", executionId, execution.getStatus());
            return;
        }

        List<ExecutionStep> allSteps = stepRepository.findByExecutionIdOrderByStepNumberAsc(executionId);

        // Find the first pending step and resume from there
        List<ExecutionStep> remainingSteps = allSteps.stream()
                .filter(s -> s.getStatus() == ExecutionStatus.pending)
                .toList();

        if (remainingSteps.isEmpty()) {
            execution.setStatus(ExecutionStatus.completed);
            execution.setCompletedAt(Instant.now());
            executionRepository.save(execution);
            return;
        }

        executeSteps(execution, remainingSteps);
    }

    /**
     * Cancel a running or pending execution.
     */
    @Transactional
    public AgentExecution cancelExecution(UUID executionId) {
        AgentExecution execution = executionRepository.findById(executionId)
                .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + executionId));

        if (execution.getStatus() == ExecutionStatus.completed
                || execution.getStatus() == ExecutionStatus.failed
                || execution.getStatus() == ExecutionStatus.cancelled) {
            throw new IllegalStateException("Execution already in terminal state: " + execution.getStatus());
        }

        execution.setStatus(ExecutionStatus.cancelled);
        execution.setCompletedAt(Instant.now());
        return executionRepository.save(execution);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> asMap(Object obj) {
        if (obj instanceof Map) {
            return (Map<String, Object>) obj;
        }
        return Map.of();
    }
}
