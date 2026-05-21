package com.kyra.notification.service;

import com.kyra.notification.model.Notification;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${kyra.notification.email.from:noreply@kyra.ai}")
    private String fromAddress;

    @Value("${kyra.notification.email.enabled:false}")
    private boolean emailEnabled;

    @Async
    public void sendNotificationEmail(String toAddress, Notification notification) {
        if (!emailEnabled) {
            log.debug("Email notifications disabled, skipping email for notification {}", notification.getId());
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromAddress);
            message.setTo(toAddress);
            message.setSubject("[KYRA Guardrail] " + notification.getTitle());
            message.setText(buildEmailBody(notification));

            mailSender.send(message);
            log.info("Sent notification email to {} for notification {}", toAddress, notification.getId());
        } catch (Exception e) {
            log.error("Failed to send notification email to {} for notification {}: {}",
                    toAddress, notification.getId(), e.getMessage());
        }
    }

    private String buildEmailBody(Notification notification) {
        StringBuilder sb = new StringBuilder();
        sb.append("KYRA AI Guardrail Notification\n");
        sb.append("================================\n\n");
        sb.append("Type: ").append(notification.getType().name().toUpperCase()).append("\n");
        sb.append("Title: ").append(notification.getTitle()).append("\n\n");
        sb.append(notification.getMessage()).append("\n");

        if (notification.getActionUrl() != null) {
            sb.append("\nAction Required: ").append(notification.getActionUrl()).append("\n");
        }

        sb.append("\n---\n");
        sb.append("This is an automated notification from KYRA AI Guardrail.\n");
        return sb.toString();
    }
}
