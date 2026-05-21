package com.kyra.notification.controller;

import com.kyra.notification.dto.CreateNotificationRequest;
import com.kyra.notification.dto.NotificationCountDTO;
import com.kyra.notification.dto.NotificationDTO;
import com.kyra.notification.service.NotificationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/notifications")
@RequiredArgsConstructor
@Slf4j
public class NotificationController {

    private final NotificationService notificationService;

    @GetMapping
    public ResponseEntity<Page<NotificationDTO>> listNotifications(
            @RequestParam UUID userId,
            @PageableDefault(size = 20) Pageable pageable) {
        log.info("List notifications for user {} page={}", userId, pageable.getPageNumber());
        Page<NotificationDTO> notifications = notificationService.getUserNotifications(userId, pageable);
        return ResponseEntity.ok(notifications);
    }

    @GetMapping("/unread-count")
    public ResponseEntity<NotificationCountDTO> getUnreadCount(@RequestParam UUID userId) {
        log.info("Get unread count for user {}", userId);
        NotificationCountDTO count = notificationService.getUnreadCount(userId);
        return ResponseEntity.ok(count);
    }

    @PostMapping
    public ResponseEntity<NotificationDTO> createNotification(
            @Valid @RequestBody CreateNotificationRequest request) {
        log.info("Create notification for user {} type={}", request.getUserId(), request.getType());
        NotificationDTO created = notificationService.createNotification(request);
        return ResponseEntity.ok(created);
    }

    @PatchMapping("/{id}/read")
    public ResponseEntity<NotificationDTO> markAsRead(@PathVariable UUID id) {
        log.info("Mark notification {} as read", id);
        NotificationDTO updated = notificationService.markAsRead(id);
        return ResponseEntity.ok(updated);
    }

    @PostMapping("/read-all")
    public ResponseEntity<Map<String, Object>> markAllAsRead(@RequestParam UUID userId) {
        log.info("Mark all notifications as read for user {}", userId);
        int count = notificationService.markAllAsRead(userId);
        return ResponseEntity.ok(Map.of("markedAsRead", count));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> dismiss(@PathVariable UUID id) {
        log.info("Dismiss notification {}", id);
        notificationService.dismiss(id);
        return ResponseEntity.noContent().build();
    }
}
