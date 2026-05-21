package com.kyra.workflow.service;

import com.kyra.workflow.client.MLServiceClient;
import com.kyra.workflow.client.RAGServiceClient;
import com.kyra.workflow.dto.WorkflowResultDTO;
import com.kyra.workflow.model.Workflow;
import com.kyra.workflow.model.WorkflowExecution;
import com.kyra.workflow.repository.WorkflowExecutionRepository;
import com.kyra.workflow.repository.WorkflowRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

@Service
@Slf4j
@RequiredArgsConstructor
public class WorkflowEngine {

    private final WorkflowRepository workflowRepository;
    private final WorkflowExecutionRepository executionRepository;
    private final MLServiceClient mlServiceClient;
    private final RAGServiceClient ragServiceClient;
    private final OutputFormatter outputFormatter;

    /**
     * Execute a workflow by processing each step sequentially.
     */
    public WorkflowResultDTO execute(UUID workflowId, UUID userId, Map<String, Object> input) {
        Workflow workflow = workflowRepository.findById(workflowId)
                .orElseThrow(() -> new NoSuchElementException("Workflow not found: " + workflowId));

        if (workflow.getStatus() != Workflow.WorkflowStatus.active) {
            throw new IllegalStateException("Workflow is not active: " + workflow.getStatus());
        }

        WorkflowExecution execution = WorkflowExecution.builder()
                .workflowId(workflowId)
                .userId(userId)
                .input(input)
                .status(WorkflowExecution.ExecutionStatus.running)
                .startedAt(Instant.now())
                .build();
        execution = executionRepository.save(execution);

        List<Map<String, Object>> stepResults = new ArrayList<>();
        Map<String, Object> context = new HashMap<>(input);

        try {
            List<Map<String, Object>> steps = workflow.getSteps();
            for (int i = 0; i < steps.size(); i++) {
                Map<String, Object> step = steps.get(i);
                execution.setCurrentStep(i);
                executionRepository.save(execution);

                Map<String, Object> stepResult = executeStep(step, context);
                stepResults.add(stepResult);

                // Merge step result into context for subsequent steps
                context.put("step_" + i + "_result", stepResult);
                if (stepResult.containsKey("content")) {
                    context.put("lastContent", stepResult.get("content"));
                }
            }

            // Build final output
            Map<String, Object> output = buildOutput(stepResults, context);
            String formattedOutput = outputFormatter.format(output, workflow.getOutputFormat());

            Instant completedAt = Instant.now();
            int durationMs = (int) (completedAt.toEpochMilli() - execution.getStartedAt().toEpochMilli());

            execution.setStatus(WorkflowExecution.ExecutionStatus.completed);
            execution.setOutput(output);
            execution.setStepResults(stepResults);
            execution.setCompletedAt(completedAt);
            execution.setDurationMs(durationMs);
            executionRepository.save(execution);

            return WorkflowResultDTO.builder()
                    .executionId(execution.getId())
                    .status("completed")
                    .formattedOutput(formattedOutput)
                    .outputFormat(workflow.getOutputFormat())
                    .rawOutput(output)
                    .stepResults(stepResults)
                    .durationMs(durationMs)
                    .build();

        } catch (Exception e) {
            log.error("Workflow execution failed: workflowId={}, executionId={}", workflowId, execution.getId(), e);

            Instant completedAt = Instant.now();
            int durationMs = (int) (completedAt.toEpochMilli() - execution.getStartedAt().toEpochMilli());

            execution.setStatus(WorkflowExecution.ExecutionStatus.failed);
            execution.setErrorMessage(e.getMessage());
            execution.setStepResults(stepResults);
            execution.setCompletedAt(completedAt);
            execution.setDurationMs(durationMs);
            executionRepository.save(execution);

            return WorkflowResultDTO.builder()
                    .executionId(execution.getId())
                    .status("failed")
                    .stepResults(stepResults)
                    .durationMs(durationMs)
                    .build();
        }
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> executeStep(Map<String, Object> step, Map<String, Object> context) {
        String type = (String) step.getOrDefault("type", "transform");
        String name = (String) step.getOrDefault("name", "unnamed");
        log.info("Executing step: {} (type={})", name, type);

        return switch (type) {
            case "llm_call" -> executeLlmStep(step, context);
            case "rag_search" -> executeRagStep(step, context);
            case "transform" -> executeTransformStep(step, context);
            case "validate" -> executeValidateStep(step, context);
            case "output" -> executeOutputStep(step, context);
            default -> {
                log.warn("Unknown step type: {}", type);
                yield Map.of("type", type, "status", "skipped", "reason", "unknown step type");
            }
        };
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> executeLlmStep(Map<String, Object> step, Map<String, Object> context) {
        String prompt = resolveTemplate((String) step.getOrDefault("prompt", ""), context);
        String model = (String) step.getOrDefault("model", "default");
        Double temperature = step.containsKey("temperature")
                ? ((Number) step.get("temperature")).doubleValue()
                : 0.7;
        Integer maxTokens = step.containsKey("maxTokens")
                ? ((Number) step.get("maxTokens")).intValue()
                : 2048;

        List<MLServiceClient.MessageEntry> messages = new ArrayList<>();

        if (step.containsKey("systemPrompt")) {
            messages.add(MLServiceClient.MessageEntry.builder()
                    .role("system")
                    .content(resolveTemplate((String) step.get("systemPrompt"), context))
                    .build());
        }

        messages.add(MLServiceClient.MessageEntry.builder()
                .role("user")
                .content(prompt)
                .build());

        MLServiceClient.CompletionRequest request = MLServiceClient.CompletionRequest.builder()
                .messages(messages)
                .model(model)
                .temperature(temperature)
                .maxTokens(maxTokens)
                .stream(false)
                .build();

        MLServiceClient.CompletionResponse response = mlServiceClient.complete(request).block();

        Map<String, Object> result = new HashMap<>();
        result.put("type", "llm_call");
        result.put("status", "completed");
        if (response != null) {
            result.put("content", response.getContent());
            result.put("promptTokens", response.getPromptTokens());
            result.put("completionTokens", response.getCompletionTokens());
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> executeRagStep(Map<String, Object> step, Map<String, Object> context) {
        String query = resolveTemplate((String) step.getOrDefault("query", ""), context);
        List<String> collectionIds = (List<String>) step.getOrDefault("collectionIds", List.of());
        Integer topK = step.containsKey("topK") ? ((Number) step.get("topK")).intValue() : 5;

        RAGServiceClient.SearchRequest request = RAGServiceClient.SearchRequest.builder()
                .query(query)
                .collectionIds(collectionIds)
                .topK(topK)
                .build();

        RAGServiceClient.SearchResponse response = ragServiceClient.search(request).block();

        Map<String, Object> result = new HashMap<>();
        result.put("type", "rag_search");
        result.put("status", "completed");
        if (response != null && response.getResults() != null) {
            result.put("resultCount", response.getResults().size());

            // Combine search results into content
            StringBuilder content = new StringBuilder();
            for (RAGServiceClient.SearchResult sr : response.getResults()) {
                if (sr.getTitle() != null) {
                    content.append("### ").append(sr.getTitle()).append("\n");
                }
                content.append(sr.getContent()).append("\n\n");
            }
            result.put("content", content.toString().trim());
            result.put("results", response.getResults());
        }
        return result;
    }

    private Map<String, Object> executeTransformStep(Map<String, Object> step, Map<String, Object> context) {
        Map<String, Object> result = new HashMap<>();
        result.put("type", "transform");
        result.put("status", "completed");

        // Apply simple key-mapping transforms
        String operation = (String) step.getOrDefault("operation", "passthrough");
        switch (operation) {
            case "merge" -> {
                // Merge all step results into a single content field
                StringBuilder merged = new StringBuilder();
                for (Map.Entry<String, Object> entry : context.entrySet()) {
                    if (entry.getKey().startsWith("step_") && entry.getValue() instanceof Map<?, ?> stepResult) {
                        Object content = stepResult.get("content");
                        if (content != null) {
                            merged.append(content).append("\n\n");
                        }
                    }
                }
                result.put("content", merged.toString().trim());
            }
            case "extract" -> {
                String field = (String) step.getOrDefault("field", "lastContent");
                result.put("content", context.getOrDefault(field, ""));
            }
            default -> {
                // passthrough
                result.put("content", context.getOrDefault("lastContent", ""));
            }
        }
        return result;
    }

    private Map<String, Object> executeValidateStep(Map<String, Object> step, Map<String, Object> context) {
        Map<String, Object> result = new HashMap<>();
        result.put("type", "validate");

        String content = context.getOrDefault("lastContent", "").toString();

        // Basic validation rules
        boolean valid = true;
        List<String> errors = new ArrayList<>();

        if (step.containsKey("minLength")) {
            int minLength = ((Number) step.get("minLength")).intValue();
            if (content.length() < minLength) {
                valid = false;
                errors.add("Content too short: " + content.length() + " < " + minLength);
            }
        }

        if (step.containsKey("maxLength")) {
            int maxLength = ((Number) step.get("maxLength")).intValue();
            if (content.length() > maxLength) {
                valid = false;
                errors.add("Content too long: " + content.length() + " > " + maxLength);
            }
        }

        if (step.containsKey("requiredFields")) {
            @SuppressWarnings("unchecked")
            List<String> requiredFields = (List<String>) step.get("requiredFields");
            for (String field : requiredFields) {
                if (!context.containsKey(field)) {
                    valid = false;
                    errors.add("Missing required field: " + field);
                }
            }
        }

        result.put("valid", valid);
        result.put("errors", errors);
        result.put("status", valid ? "completed" : "failed");
        result.put("content", content);

        if (!valid) {
            log.warn("Validation failed: {}", errors);
        }

        return result;
    }

    private Map<String, Object> executeOutputStep(Map<String, Object> step, Map<String, Object> context) {
        Map<String, Object> result = new HashMap<>();
        result.put("type", "output");
        result.put("status", "completed");
        result.put("content", context.getOrDefault("lastContent", ""));

        // Copy any additional output fields specified in the step
        if (step.containsKey("fields")) {
            @SuppressWarnings("unchecked")
            List<String> fields = (List<String>) step.get("fields");
            Map<String, Object> outputFields = new HashMap<>();
            for (String field : fields) {
                if (context.containsKey(field)) {
                    outputFields.put(field, context.get(field));
                }
            }
            result.put("outputFields", outputFields);
        }

        return result;
    }

    private Map<String, Object> buildOutput(List<Map<String, Object>> stepResults, Map<String, Object> context) {
        Map<String, Object> output = new HashMap<>();

        // Use the last step result's content as primary output
        if (!stepResults.isEmpty()) {
            Map<String, Object> lastResult = stepResults.get(stepResults.size() - 1);
            if (lastResult.containsKey("content")) {
                output.put("content", lastResult.get("content"));
            }
            if (lastResult.containsKey("outputFields")) {
                output.putAll((Map<String, Object>) lastResult.get("outputFields"));
            }
        }

        output.put("stepCount", stepResults.size());
        return output;
    }

    /**
     * Resolve template placeholders like {{key}} from context.
     */
    private String resolveTemplate(String template, Map<String, Object> context) {
        if (template == null) return "";
        String resolved = template;
        for (Map.Entry<String, Object> entry : context.entrySet()) {
            String placeholder = "{{" + entry.getKey() + "}}";
            if (resolved.contains(placeholder) && entry.getValue() != null) {
                resolved = resolved.replace(placeholder, entry.getValue().toString());
            }
        }
        return resolved;
    }
}
