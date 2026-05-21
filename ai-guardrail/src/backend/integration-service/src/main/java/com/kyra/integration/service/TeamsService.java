package com.kyra.integration.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.*;

@Service
@RequiredArgsConstructor
@Slf4j
public class TeamsService {

    @Value("${teams.app-id:}")
    private String appId;

    @Value("${teams.app-secret:}")
    private String appSecret;

    @Value("${teams.tenant-id:}")
    private String teamsTenantId;

    private final WebClient.Builder webClientBuilder;

    private static final String GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
    private static final String LOGIN_BASE = "https://login.microsoftonline.com";

    /**
     * Send an Adaptive Card to a Teams channel via incoming webhook or Bot Framework.
     */
    public Map<String, Object> sendAdaptiveCard(String webhookUrl, Map<String, Object> cardPayload) {
        Map<String, Object> wrapper = new HashMap<>();
        wrapper.put("type", "message");
        wrapper.put("attachments", List.of(Map.of(
                "contentType", "application/vnd.microsoft.card.adaptive",
                "contentUrl", (Object) null,
                "content", cardPayload
        )));

        try {
            webClientBuilder.build()
                    .post()
                    .uri(webhookUrl)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(wrapper)
                    .retrieve()
                    .toBodilessEntity()
                    .block();

            log.info("Adaptive Card sent to Teams webhook");
            return Map.of("ok", true);
        } catch (Exception e) {
            log.error("Failed to send Adaptive Card to Teams: {}", e.getMessage());
            return Map.of("ok", false, "error", e.getMessage());
        }
    }

    /**
     * Build a standard KYRA alert Adaptive Card.
     */
    public Map<String, Object> buildAlertCard(String title, String message,
                                               String severity, Map<String, Object> details) {
        List<Map<String, Object>> body = new ArrayList<>();

        // Header
        body.add(Map.of(
                "type", "TextBlock",
                "size", "Large",
                "weight", "Bolder",
                "text", "KYRA AI Guardrail Alert",
                "color", "Accent"
        ));

        // Title
        body.add(Map.of(
                "type", "TextBlock",
                "text", title,
                "weight", "Bolder",
                "wrap", true
        ));

        // Severity badge
        body.add(Map.of(
                "type", "ColumnSet",
                "columns", List.of(
                        Map.of("type", "Column",
                                "width", "auto",
                                "items", List.of(Map.of(
                                        "type", "TextBlock",
                                        "text", "Severity: " + severity,
                                        "color", getSeverityColor(severity),
                                        "weight", "Bolder"
                                )))
                )
        ));

        // Message
        body.add(Map.of(
                "type", "TextBlock",
                "text", message,
                "wrap", true
        ));

        // Details as fact set
        if (details != null && !details.isEmpty()) {
            List<Map<String, String>> facts = new ArrayList<>();
            details.forEach((k, v) -> facts.add(Map.of("title", k, "value", String.valueOf(v))));
            body.add(Map.of(
                    "type", "FactSet",
                    "facts", facts
            ));
        }

        // Actions
        List<Map<String, Object>> actions = List.of(
                Map.of("type", "Action.OpenUrl",
                        "title", "View in KYRA Dashboard",
                        "url", "https://kyra.example.com/dashboard"),
                Map.of("type", "Action.Submit",
                        "title", "Acknowledge",
                        "data", Map.of("action", "acknowledge"))
        );

        return Map.of(
                "$schema", "http://adaptivecards.io/schemas/adaptive-card.json",
                "type", "AdaptiveCard",
                "version", "1.5",
                "body", body,
                "actions", actions
        );
    }

    /**
     * Handle an incoming bot message from Teams.
     */
    public Map<String, Object> handleBotMessage(Map<String, Object> activity) {
        String type = (String) activity.get("type");

        if ("message".equals(type)) {
            String text = (String) activity.get("text");
            log.info("Teams bot message received: {}", text);

            // Build reply activity
            Map<String, Object> reply = new HashMap<>();
            reply.put("type", "message");
            reply.put("text", "KYRA received your message: " + text);

            // Attach Adaptive Card for rich response
            Map<String, Object> card = buildAlertCard(
                    "Query Received",
                    "Processing your request: " + text,
                    "info",
                    Map.of("Status", "Processing", "Query", text)
            );

            reply.put("attachments", List.of(Map.of(
                    "contentType", "application/vnd.microsoft.card.adaptive",
                    "content", card
            )));

            return reply;
        }

        return Map.of("type", "message", "text", "OK");
    }

    /**
     * Obtain an OAuth2 token for the Bot Framework.
     */
    public String getBotToken() {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = webClientBuilder.build()
                    .post()
                    .uri(LOGIN_BASE + "/" + teamsTenantId + "/oauth2/v2.0/token")
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .bodyValue("grant_type=client_credentials" +
                            "&client_id=" + appId +
                            "&client_secret=" + appSecret +
                            "&scope=https://api.botframework.com/.default")
                    .retrieve()
                    .bodyToMono(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();

            return response != null ? (String) response.get("access_token") : null;
        } catch (Exception e) {
            log.error("Failed to obtain Teams bot token: {}", e.getMessage());
            return null;
        }
    }

    private String getSeverityColor(String severity) {
        return switch (severity.toLowerCase()) {
            case "critical", "high" -> "Attention";
            case "medium", "warning" -> "Warning";
            case "low", "info" -> "Good";
            default -> "Default";
        };
    }
}
