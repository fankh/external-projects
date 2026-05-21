package com.kyra.integration.controller;

import com.kyra.integration.service.EmailService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/v1/integrations/email")
@RequiredArgsConstructor
public class EmailController {

    private final EmailService emailService;

    public record FetchReq(String host, Integer port, String username, String password,
                           Boolean ssl, Integer maxMessages) {}

    @PostMapping("/fetch")
    public ResponseEntity<List<EmailService.EmailMessage>> fetch(@RequestBody FetchReq r) {
        var msgs = emailService.fetchInbox(
            r.host(), r.port() != null ? r.port() : 993,
            r.username(), r.password(),
            r.ssl() != null ? r.ssl() : true,
            r.maxMessages() != null ? r.maxMessages() : 20
        );
        return ResponseEntity.ok(msgs);
    }
}
