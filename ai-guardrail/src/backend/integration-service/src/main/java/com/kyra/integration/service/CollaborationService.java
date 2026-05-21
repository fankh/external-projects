package com.kyra.integration.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Collaboration messaging service. Posts structured messages to Teams/Slack
 * via incoming webhooks. Supports Adaptive Cards (Teams) and Block Kit (Slack).
 */
@Service
@Slf4j
public class CollaborationService {

    /**
     * Post an Adaptive Card to Microsoft Teams via incoming webhook.
     *
     * @param webhookUrl Teams incoming webhook URL
     * @param title      Card title
     * @param body       Card body text (supports markdown)
     * @param facts      Key-value pairs shown in the card
     * @param actionUrl  Optional button URL
     * @param actionLabel Optional button label
     */
    public boolean postTeamsAdaptiveCard(String webhookUrl, String title, String body,
                                          Map<String, String> facts, String actionUrl, String actionLabel) {
        if (webhookUrl == null || webhookUrl.isBlank()) return false;

        // Build Adaptive Card JSON
        var factsList = new java.util.ArrayList<Map<String, String>>();
        if (facts != null) {
            facts.forEach((k, v) -> factsList.add(Map.of("title", k, "value", v)));
        }

        var cardBody = new java.util.ArrayList<Map<String, Object>>();
        cardBody.add(Map.of("type", "TextBlock", "size", "Medium", "weight", "Bolder", "text", title));
        cardBody.add(Map.of("type", "TextBlock", "text", body, "wrap", true));
        if (!factsList.isEmpty()) {
            cardBody.add(Map.of("type", "FactSet", "facts", factsList));
        }

        var actions = new java.util.ArrayList<Map<String, Object>>();
        if (actionUrl != null && actionLabel != null) {
            actions.add(Map.of("type", "Action.OpenUrl", "title", actionLabel, "url", actionUrl));
        }

        var card = Map.of(
            "type", "message",
            "attachments", List.of(Map.of(
                "contentType", "application/vnd.microsoft.card.adaptive",
                "contentUrl", (Object) null,
                "content", Map.of(
                    "$schema", "http://adaptivecards.io/schemas/adaptive-card.json",
                    "type", "AdaptiveCard",
                    "version", "1.4",
                    "body", cardBody,
                    "actions", actions
                )
            ))
        );

        try {
            RestClient.builder().baseUrl(webhookUrl).build()
                .post().contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(card).retrieve().toBodilessEntity();
            log.info("Teams Adaptive Card posted to webhook");
            return true;
        } catch (Exception e) {
            log.warn("Teams post failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Post a Block Kit message to Slack via incoming webhook.
     *
     * @param webhookUrl Slack incoming webhook URL
     * @param title      Header text
     * @param body       Section text (supports mrkdwn)
     * @param fields     Key-value fields shown side by side
     * @param actionUrl  Optional button URL
     * @param actionLabel Optional button label
     */
    public boolean postSlackBlockKit(String webhookUrl, String title, String body,
                                      Map<String, String> fields, String actionUrl, String actionLabel) {
        if (webhookUrl == null || webhookUrl.isBlank()) return false;

        var blocks = new java.util.ArrayList<Map<String, Object>>();
        blocks.add(Map.of("type", "header", "text", Map.of("type", "plain_text", "text", title, "emoji", true)));
        blocks.add(Map.of("type", "section", "text", Map.of("type", "mrkdwn", "text", body)));

        if (fields != null && !fields.isEmpty()) {
            var fieldBlocks = new java.util.ArrayList<Map<String, Object>>();
            fields.forEach((k, v) -> fieldBlocks.add(Map.of("type", "mrkdwn", "text", "*" + k + "*\n" + v)));
            blocks.add(Map.of("type", "section", "fields", fieldBlocks));
        }

        if (actionUrl != null && actionLabel != null) {
            blocks.add(Map.of("type", "actions", "elements", List.of(Map.of(
                "type", "button", "text", Map.of("type", "plain_text", "text", actionLabel),
                "url", actionUrl, "style", "primary"
            ))));
        }

        blocks.add(Map.of("type", "divider"));
        blocks.add(Map.of("type", "context", "elements", List.of(
            Map.of("type", "mrkdwn", "text", ":shield: Sent by KYRA AI Guardrail")
        )));

        var payload = Map.of("blocks", blocks);

        try {
            RestClient.builder().baseUrl(webhookUrl).build()
                .post().contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(payload).retrieve().toBodilessEntity();
            log.info("Slack Block Kit message posted");
            return true;
        } catch (Exception e) {
            log.warn("Slack post failed: {}", e.getMessage());
            return false;
        }
    }


    /**
     * Post a card to Google Chat space via incoming webhook.
     */
    public boolean postGoogleChat(String webhookUrl, String title, String subtitle, String body,
                                    Map<String, String> widgets, String buttonUrl, String buttonLabel) {
        if (webhookUrl == null || webhookUrl.isBlank()) return false;

        var sections = new java.util.ArrayList<Map<String, Object>>();
        var headerWidget = Map.of("keyValue", Map.of("topLabel", subtitle != null ? subtitle : "", "content", body));
        sections.add(Map.of("widgets", List.of(headerWidget)));

        if (widgets != null && !widgets.isEmpty()) {
            var kvWidgets = new java.util.ArrayList<Map<String, Object>>();
            widgets.forEach((k, v) -> kvWidgets.add(Map.of("keyValue", Map.of("topLabel", k, "content", v))));
            sections.add(Map.of("widgets", kvWidgets));
        }

        if (buttonUrl != null && buttonLabel != null) {
            sections.add(Map.of("widgets", List.of(Map.of(
                "buttons", List.of(Map.of("textButton", Map.of(
                    "text", buttonLabel,
                    "onClick", Map.of("openLink", Map.of("url", buttonUrl))
                )))
            ))));
        }

        var card = Map.of("cards", List.of(Map.of(
            "header", Map.of("title", title, "subtitle", subtitle != null ? subtitle : "KYRA AI Guardrail"),
            "sections", sections
        )));

        try {
            RestClient.builder().baseUrl(webhookUrl).build()
                .post().contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(card).retrieve().toBodilessEntity();
            log.info("Google Chat card posted");
            return true;
        } catch (Exception e) {
            log.warn("Google Chat post failed: {}", e.getMessage());
            return false;
        }
    }

    /**
     * Trigger a GitLab CI pipeline via API.
     *
     * @param gitlabUrl   GitLab instance URL (e.g. https://gitlab.com)
     * @param projectId   Numeric project ID
     * @param ref         Branch or tag to run pipeline on
     * @param privateToken GitLab personal access token (api scope)
     * @param variables   Pipeline variables
     */
    public Map<String, Object> triggerGitLabPipeline(String gitlabUrl, String projectId,
                                                      String ref, String privateToken,
                                                      Map<String, String> variables) {
        if (gitlabUrl == null || privateToken == null) return Map.of("error", "missing config");

        var varList = new java.util.ArrayList<Map<String, String>>();
        if (variables != null) {
            variables.forEach((k, v) -> varList.add(Map.of("key", k, "value", v)));
        }

        var body = new java.util.HashMap<String, Object>();
        body.put("ref", ref != null ? ref : "main");
        body.put("variables", varList);

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> resp = (Map<String, Object>) RestClient.builder()
                .baseUrl(gitlabUrl)
                .defaultHeader("PRIVATE-TOKEN", privateToken)
                .build()
                .post()
                .uri("/api/v4/projects/{pid}/pipeline", projectId)
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(Map.class);
            log.info("GitLab pipeline triggered for project {} ref {}", projectId, ref);
            return resp != null ? resp : Map.of("status", "triggered");
        } catch (Exception e) {
            log.warn("GitLab pipeline trigger failed: {}", e.getMessage());
            return Map.of("error", e.getMessage());
        }
    }

}
