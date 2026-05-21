package com.kyra.notification.service;

import com.kyra.notification.dto.CreateNotificationRequest;
import com.kyra.notification.dto.NotificationCountDTO;
import com.kyra.notification.dto.NotificationDTO;
import com.kyra.notification.model.Notification;
import com.kyra.notification.repository.NotificationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final EmailService emailService;

    public Page<NotificationDTO> getUserNotifications(UUID userId, Pageable pageable) {
        return notificationRepository.findByUserIdOrderByCreatedAtDesc(userId, pageable)
                .map(NotificationDTO::fromEntity);
    }

    public NotificationCountDTO getUnreadCount(UUID userId) {
        long count = notificationRepository.countByUserIdAndStatus(userId, Notification.NotificationStatus.unread);
        return NotificationCountDTO.builder().unreadCount(count).build();
    }

    @Transactional
    public NotificationDTO createNotification(CreateNotificationRequest request) {
        log.info("Creating notification for user {} type={} title={}",
                request.getUserId(), request.getType(), request.getTitle());

        Notification notification = Notification.builder()
                .userId(request.getUserId())
                .type(request.getType())
                .title(request.getTitle())
                .message(request.getMessage())
                .status(Notification.NotificationStatus.unread)
                .actionUrl(request.getActionUrl())
                .metadata(request.getMetadata() != null ? request.getMetadata() : Map.of())
                .build();

        Notification saved = notificationRepository.save(notification);

        // Send email for security and system notifications
        if (request.getType() == Notification.NotificationType.security ||
            request.getType() == Notification.NotificationType.system) {
            log.info("Critical notification created, triggering email for user {}", request.getUserId());
            // Email address would be resolved from user service in production
            // emailService.sendNotificationEmail(userEmail, saved);
        }

        return NotificationDTO.fromEntity(saved);
    }

    @Transactional
    public List<NotificationDTO> batchCreate(List<CreateNotificationRequest> requests) {
        log.info("Batch creating {} notifications", requests.size());
        return requests.stream()
                .map(this::createNotification)
                .toList();
    }

    @Transactional
    public NotificationDTO markAsRead(UUID notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NoSuchElementException("Notification not found: " + notificationId));

        notification.setStatus(Notification.NotificationStatus.read);
        notification.setReadAt(Instant.now());
        Notification saved = notificationRepository.save(notification);
        return NotificationDTO.fromEntity(saved);
    }

    @Transactional
    public int markAllAsRead(UUID userId) {
        int updated = notificationRepository.markAllAsRead(userId);
        log.info("Marked {} notifications as read for user {}", updated, userId);
        return updated;
    }

    @Transactional
    public void dismiss(UUID notificationId) {
        Notification notification = notificationRepository.findById(notificationId)
                .orElseThrow(() -> new NoSuchElementException("Notification not found: " + notificationId));

        notification.setStatus(Notification.NotificationStatus.dismissed);
        notificationRepository.save(notification);
        log.info("Dismissed notification {}", notificationId);
    }
}
