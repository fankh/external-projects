package com.kyra.integration.service;

import com.kyra.integration.model.Integration;
import com.kyra.integration.repository.IntegrationRepository;
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
public class SlackService {

    @Value("${slack.bot-token:}")
    private String botToken;

    @Value("${slack.signing-secret:}")
    private String signingSecret;

    private final IntegrationRepository integrationRepository;
    private final WebClient.Builder webClientBuilder;

    private static final String SLACK_API_BASE = "https://slack.com/api";

    /**
     * Send a message to a Slack channel.
     */
    public Map<String, Object> sendMessage(String channel, String text,
                                            List<Map<String, Object>> blocks) {
        Map<String, Object> body = new HashMap<>();
        body.put("channel", channel);
        body.put("text", text);
        if (blocks != null && !blocks.isEmpty()) {
            body.put("blocks", blocks);
        }

        return postToSlack("/chat.postMessage", body);
    }

    /**
     * Handle incoming Slack events (message, app_mention, etc.)
     */
    public Map<String, Object> handleEvent(Map<String, Object> eventPayload) {
        String type = (String) eventPayload.get("type");

        // URL verification challenge
        if ("url_verification".equals(type)) {
            return Map.of("challenge", eventPayload.get("challenge"));
        }

        if ("event_callback".equals(type)) {
            @SuppressWarnings("unchecked")
            Map<String, Object> event = (Map<String, Object>) eventPayload.get("event");
            String eventType = (String) event.get("type");

            switch (eventType) {
                case "app_mention" -> handleAppMention(event);
                case "message" -> handleDirectMessage(event);
                default -> log.debug("Unhandled Slack event type: {}", eventType);
            }
        }

        return Map.of("ok", true);
    }

    /**
     * Handle slash commands (/kyra ask, /kyra search).
     */
    public Map<String, Object> handleSlashCommand(Map<String, String> formData) {
        String command = formData.get("command");
        String text = formData.get("text");
        String responseUrl = formData.get("response_url");
        String userId = formData.get("user_id");
        String channelId = formData.get("channel_id");

        log.info("Slash command received: command={} text={} user={}", command, text, userId);

        if (text == null || text.isBlank()) {
            return Map.of(
                    "response_type", "ephemeral",
                    "text", "Usage: /kyra [ask|search] <query>"
            );
        }

        String[] parts = text.split("\\s+", 2);
        String subCommand = parts[0].toLowerCase();
        String query = parts.length > 1 ? parts[1] : "";

        return switch (subCommand) {
            case "ask" -> handleAskCommand(query, channelId, userId, responseUrl);
            case "search" -> handleSearchCommand(query, channelId, userId, responseUrl);
            default -> Map.of(
                    "response_type", "ephemeral",
                    "text", "Unknown subcommand. Usage: /kyra [ask|search] <query>"
            );
        };
    }

    /**
     * Handle interactive component callbacks (modals, buttons, menus).
     */
    public Map<String, Object> handleInteraction(Map<String, Object> interactionPayload) {
        String type = (String) interactionPayload.get("type");

        log.info("Slack interaction received: type={}", type);

        return switch (type) {
            case "block_actions" -> handleBlockActions(interactionPayload);
            case "view_submission" -> handleViewSubmission(interactionPayload);
            case "view_closed" -> Map.of("ok", true);
            default -> {
                log.debug("Unhandled interaction type: {}", type);
                yield Map.of("ok", true);
            }
        };
    }

    private void handleAppMention(Map<String, Object> event) {
        String text = (String) event.get("text");
        String channel = (String) event.get("channel");
        String user = (String) event.get("user");

        log.info("App mention from user {} in channel {}: {}", user, channel, text);

        // Strip bot mention and process the query
        String query = text.replaceAll("<@[A-Z0-9]+>", "").trim();
        if (!query.isEmpty()) {
            sendMessage(channel,
                    "Processing your request: " + query,
                    buildProcessingBlocks(query, user));
        }
    }

    private void handleDirectMessage(Map<String, Object> event) {
        // Ignore bot's own messages
        if (event.containsKey("bot_id")) return;

        String text = (String) event.get("text");
        String channel = (String) event.get("channel");
        String user = (String) event.get("user");

        log.info("Direct message from user {} in channel {}: {}", user, channel, text);

        sendMessage(channel,
                "I received your message. Let me process that for you.",
                null);
    }

    private Map<String, Object> handleAskCommand(String query, String channelId,
                                                   String userId, String responseUrl) {
        log.info("Processing /kyra ask: query={} user={}", query, userId);

        // Acknowledge immediately, process asynchronously
        if (responseUrl != null) {
            // Send delayed response via response_url
            Map<String, Object> delayedResponse = Map.of(
                    "response_type", "in_channel",
                    "text", "KYRA is analyzing: " + query,
                    "blocks", buildAskResponseBlocks(query, userId)
            );

            webClientBuilder.build()
                    .post()
                    .uri(responseUrl)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(delayedResponse)
                    .retrieve()
                    .toBodilessEntity()
                    .subscribe();
        }

        return Map.of(
                "response_type", "ephemeral",
                "text", "Processing your question..."
        );
    }

    private Map<String, Object> handleSearchCommand(String query, String channelId,
                                                      String userId, String responseUrl) {
        log.info("Processing /kyra search: query={} user={}", query, userId);

        return Map.of(
                "response_type", "ephemeral",
                "text", "Searching KYRA knowledge base for: " + query + "\nResults will appear shortly."
        );
    }

    private Map<String, Object> handleBlockActions(Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> actions = (List<Map<String, Object>>) payload.get("actions");
        if (actions != null && !actions.isEmpty()) {
            Map<String, Object> action = actions.get(0);
            String actionId = (String) action.get("action_id");
            log.info("Block action: {}", actionId);
        }
        return Map.of("ok", true);
    }

    private Map<String, Object> handleViewSubmission(Map<String, Object> payload) {
        @SuppressWarnings("unchecked")
        Map<String, Object> view = (Map<String, Object>) payload.get("view");
        String callbackId = view != null ? (String) view.get("callback_id") : null;
        log.info("View submission: callback_id={}", callbackId);
        return Map.of("response_action", "clear");
    }

    private List<Map<String, Object>> buildProcessingBlocks(String query, String user) {
        return List.of(
                Map.of("type", "section",
                        "text", Map.of("type", "mrkdwn",
                                "text", ":robot_face: *KYRA AI Guardrail*\n" +
                                        "Processing request from <@" + user + ">:\n>" + query)),
                Map.of("type", "divider"),
                Map.of("type", "actions",
                        "elements", List.of(
                                Map.of("type", "button",
                                        "text", Map.of("type", "plain_text", "text", "View Details"),
                                        "action_id", "view_details",
                                        "style", "primary"),
                                Map.of("type", "button",
                                        "text", Map.of("type", "plain_text", "text", "Dismiss"),
                                        "action_id", "dismiss")
                        ))
        );
    }

    private List<Map<String, Object>> buildAskResponseBlocks(String query, String userId) {
        return List.of(
                Map.of("type", "section",
                        "text", Map.of("type", "mrkdwn",
                                "text", ":magnifying_glass_tilted_left: *Question from <@" +
                                        userId + ">*\n" + query)),
                Map.of("type", "divider"),
                Map.of("type", "section",
                        "text", Map.of("type", "mrkdwn",
                                "text", "_Analyzing with KYRA AI Guardrail..._"))
        );
    }

    private Map<String, Object> postToSlack(String endpoint, Map<String, Object> body) {
        try {
            return webClientBuilder.build()
                    .post()
                    .uri(SLACK_API_BASE + endpoint)
                    .header("Authorization", "Bearer " + botToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {})
                    .block();
        } catch (Exception e) {
            log.error("Slack API call failed: endpoint={} error={}", endpoint, e.getMessage());
            return Map.of("ok", false, "error", e.getMessage());
        }
    }
}
