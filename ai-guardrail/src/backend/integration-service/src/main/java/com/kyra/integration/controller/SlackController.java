package com.kyra.integration.controller;

import com.kyra.integration.service.SlackService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/integrations/slack")
@RequiredArgsConstructor
@Slf4j
public class SlackController {

    private final SlackService slackService;

    /**
     * Slack Events API endpoint.
     * Handles url_verification challenges and event_callback payloads.
     */
    @PostMapping("/events")
    public ResponseEntity<Map<String, Object>> handleEvents(
            @RequestBody Map<String, Object> payload) {
        log.info("Slack event received: type={}", payload.get("type"));
        Map<String, Object> response = slackService.handleEvent(payload);
        return ResponseEntity.ok(response);
    }

    /**
     * Slack slash command handler.
     * Receives form-encoded data from Slack.
     */
    @PostMapping("/commands")
    public ResponseEntity<Map<String, Object>> handleCommands(
            @RequestParam Map<String, String> formData) {
        log.info("Slack command received: command={}", formData.get("command"));
        Map<String, Object> response = slackService.handleSlashCommand(formData);
        return ResponseEntity.ok(response);
    }

    /**
     * Slack interactive component handler.
     * Handles button clicks, modal submissions, menu selections.
     */
    @PostMapping("/interact")
    public ResponseEntity<Map<String, Object>> handleInteraction(
            @RequestBody Map<String, Object> payload) {
        log.info("Slack interaction received");
        Map<String, Object> response = slackService.handleInteraction(payload);
        return ResponseEntity.ok(response);
    }
}
