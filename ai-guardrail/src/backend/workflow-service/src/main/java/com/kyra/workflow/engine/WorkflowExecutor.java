package com.kyra.workflow.engine;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.*;

@Service @RequiredArgsConstructor @Slf4j
public class WorkflowExecutor {

    private final WorkflowDefinitionRepository defRepo;
    private final WorkflowRunRepository runRepo;

    @Transactional
    public WorkflowRun execute(UUID workflowId, Map<String, Object> input) {
        WorkflowDefinition def = defRepo.findById(workflowId)
            .orElseThrow(() -> new NoSuchElementException("Workflow not found: " + workflowId));

        WorkflowRun run = WorkflowRun.builder()
            .workflowId(workflowId)
            .tenantId(def.getTenantId())
            .input(input)
            .status("RUNNING")
            .startedAt(Instant.now())
            .stepResults(new ArrayList<>())
            .build();
        run = runRepo.save(run);

        List<Map<String, Object>> steps = def.getSteps();
        if (steps == null || steps.isEmpty()) {
            run.setStatus("COMPLETED");
            run.setCompletedAt(Instant.now());
            return runRepo.save(run);
        }

        // Walk the step chain
        String currentId = (String) steps.get(0).get("id");
        Map<String, Object> context = new HashMap<>(input != null ? input : Map.of());

        for (int i = 0; i < steps.size() && currentId != null; i++) {
            String stepId = currentId;
            Map<String, Object> step = steps.stream()
                .filter(s -> stepId.equals(s.get("id")))
                .findFirst().orElse(null);
            if (step == null) break;

            run.setCurrentStepId(stepId);
            runRepo.save(run);

            try {
                Map<String, Object> result = executeStep(step, context);
                run.getStepResults().add(Map.of("step_id", stepId, "status", "OK", "result", result));
                context.putAll(result);
                currentId = (String) step.get("next_step_id");
                if (currentId == null) currentId = (String) step.get("next");
            } catch (Exception e) {
                run.getStepResults().add(Map.of("step_id", stepId, "status", "FAILED", "error", e.getMessage()));
                run.setStatus("FAILED");
                run.setError(e.getMessage());
                run.setCompletedAt(Instant.now());
                return runRepo.save(run);
            }
        }

        run.setStatus("COMPLETED");
        run.setOutput(context);
        run.setCompletedAt(Instant.now());
        return runRepo.save(run);
    }

    private Map<String, Object> executeStep(Map<String, Object> step, Map<String, Object> context) {
        String type = (String) step.getOrDefault("type", "noop");
        @SuppressWarnings("unchecked")
        Map<String, Object> config = (Map<String, Object>) step.getOrDefault("config", Map.of());

        return switch (type) {
            case "input" -> Map.of("received", true);
            case "transform" -> {
                // Simple key mapping
                String expr = (String) config.getOrDefault("expression", "");
                yield Map.of("transformed", true, "expression", expr);
            }
            case "api_call" -> {
                String url = (String) config.getOrDefault("url", "");
                String method = (String) config.getOrDefault("method", "GET");
                log.info("Workflow step api_call: {} {}", method, url);
                // In production, make the actual HTTP call. For MVP, log + return stub.
                yield Map.of("api_called", true, "url", url, "method", method);
            }
            case "condition" -> {
                String field = (String) config.getOrDefault("field", "");
                Object val = context.get(field);
                yield Map.of("evaluated", true, "field", field, "value", val);
            }
            default -> Map.of("type", type, "status", "noop");
        };
    }
}
