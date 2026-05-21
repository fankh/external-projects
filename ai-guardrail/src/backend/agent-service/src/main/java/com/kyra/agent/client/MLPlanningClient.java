package com.kyra.agent.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class MLPlanningClient {

    private final WebClient webClient;

    public MLPlanningClient(@Value("${ml-service.base-url}") String baseUrl) {
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    /**
     * Call the ML planning engine to generate an execution plan for a task.
     *
     * @param taskDescription what the agent should do
     * @param availableTools  list of tool names the agent may use
     * @param constraints     max_steps, timeout, requires_approval, etc.
     * @return the plan as a Map parsed from JSON (keys: steps, estimated_duration, risk_assessment)
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> generatePlan(String taskDescription,
                                            List<String> availableTools,
                                            Map<String, Object> constraints) {
        log.info("Requesting execution plan from ML service for task: {}",
                taskDescription.length() > 80 ? taskDescription.substring(0, 80) + "..." : taskDescription);

        try {
            Map<String, Object> requestBody = Map.of(
                    "task", taskDescription,
                    "available_tools", availableTools,
                    "constraints", constraints
            );

            Map<String, Object> response = webClient.post()
                    .uri("/v1/agents/plan")
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(Duration.ofSeconds(30))
                    .block();

            if (response == null) {
                throw new RuntimeException("ML service returned null response");
            }

            log.info("Received execution plan with {} steps", ((List<?>) response.get("steps")).size());
            return response;

        } catch (Exception e) {
            log.error("Failed to generate plan from ML service: {}", e.getMessage(), e);
            throw new RuntimeException("Planning failed: " + e.getMessage(), e);
        }
    }
}
