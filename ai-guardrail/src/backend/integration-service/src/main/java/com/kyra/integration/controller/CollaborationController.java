package com.kyra.integration.controller;

import com.kyra.integration.service.CollaborationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/v1/integrations/collab")
@RequiredArgsConstructor
public class CollaborationController {

    private final CollaborationService service;

    public record TeamsPostReq(String webhookUrl, String title, String body,
                                Map<String, String> facts, String actionUrl, String actionLabel) {}

    @PostMapping("/teams/post")
    public ResponseEntity<Map<String, Object>> postTeams(@RequestBody TeamsPostReq r) {
        boolean ok = service.postTeamsAdaptiveCard(r.webhookUrl(), r.title(), r.body(),
                                                    r.facts(), r.actionUrl(), r.actionLabel());
        return ResponseEntity.ok(Map.of("posted", ok, "platform", "teams"));
    }

    public record SlackPostReq(String webhookUrl, String title, String body,
                                Map<String, String> fields, String actionUrl, String actionLabel) {}

    @PostMapping("/slack/post")
    public ResponseEntity<Map<String, Object>> postSlack(@RequestBody SlackPostReq r) {
        boolean ok = service.postSlackBlockKit(r.webhookUrl(), r.title(), r.body(),
                                                r.fields(), r.actionUrl(), r.actionLabel());
        return ResponseEntity.ok(Map.of("posted", ok, "platform", "slack"));
    }

    public record GChatPostReq(String webhookUrl, String title, String subtitle, String body,
                                Map<String, String> widgets, String buttonUrl, String buttonLabel) {}

    @PostMapping("/gchat/post")
    public ResponseEntity<Map<String, Object>> postGChat(@RequestBody GChatPostReq r) {
        boolean ok = service.postGoogleChat(r.webhookUrl(), r.title(), r.subtitle(), r.body(),
                                             r.widgets(), r.buttonUrl(), r.buttonLabel());
        return ResponseEntity.ok(Map.of("posted", ok, "platform", "google_chat"));
    }

    public record GitLabTriggerReq(String gitlabUrl, String projectId, String ref,
                                    String privateToken, Map<String, String> variables) {}

    @PostMapping("/gitlab/trigger")
    public ResponseEntity<Map<String, Object>> triggerGitLab(@RequestBody GitLabTriggerReq r) {
        var result = service.triggerGitLabPipeline(r.gitlabUrl(), r.projectId(), r.ref(),
                                                    r.privateToken(), r.variables());
        return ResponseEntity.ok(result);
    }
}
