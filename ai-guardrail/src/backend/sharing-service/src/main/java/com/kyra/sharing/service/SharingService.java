package com.kyra.sharing.service;

import com.kyra.sharing.dto.*;
import com.kyra.sharing.model.ShareAccessLog;
import com.kyra.sharing.model.SharedContent;
import com.kyra.sharing.repository.ShareAccessLogRepository;
import com.kyra.sharing.repository.SharedContentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class SharingService {

    private final SharedContentRepository sharedContentRepository;
    private final ShareAccessLogRepository shareAccessLogRepository;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Transactional
    public ShareDTO shareContent(ShareRequest request, String userId) {
        String token = generateSecureToken();

        LocalDateTime expiresAt = null;
        if (request.getExpirationDays() != null && request.getExpirationDays() > 0) {
            expiresAt = LocalDateTime.now().plusDays(request.getExpirationDays());
        }

        SharedContent content = SharedContent.builder()
                .sharedBy(userId)
                .messageId(request.getMessageId())
                .conversationId(request.getMessageId()) // will be resolved by caller
                .shareType(request.getShareType())
                .recipientEmails(emailsToString(request.getRecipientEmails()))
                .note(request.getNote())
                .includeOriginalQuestion(request.getIncludeOriginalQuestion() != null ? request.getIncludeOriginalQuestion() : false)
                .includeFullThread(request.getIncludeFullThread() != null ? request.getIncludeFullThread() : false)
                .includeCitations(request.getIncludeCitations() != null ? request.getIncludeCitations() : true)
                .shareToken(token)
                .expiresAt(expiresAt)
                .viewCount(0)
                .build();

        content = sharedContentRepository.save(content);
        log.info("Created share {} with token {} by user {}", content.getId(), token, userId);
        return toDTO(content);
    }

    public SharedContentViewDTO viewSharedContent(String token, String ipAddress, String userAgent) {
        SharedContent content = sharedContentRepository.findByShareToken(token)
                .orElseThrow(() -> new RuntimeException("Shared content not found for token: " + token));

        if (content.getExpiresAt() != null && content.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw new RuntimeException("Share link has expired");
        }

        // Increment view count
        content.setViewCount(content.getViewCount() + 1);
        sharedContentRepository.save(content);

        // Log access
        ShareAccessLog accessLog = ShareAccessLog.builder()
                .sharedContentId(content.getId())
                .accessedAt(LocalDateTime.now())
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build();
        shareAccessLogRepository.save(accessLog);

        log.info("Shared content {} viewed, total views: {}", content.getId(), content.getViewCount());
        return toViewDTO(content);
    }

    public Page<ShareDTO> getMyShares(String userId, Pageable pageable) {
        return sharedContentRepository.findBySharedBy(userId, pageable)
                .map(this::toDTO);
    }

    @Transactional
    public void revokeShare(UUID id, String userId) {
        SharedContent content = sharedContentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Shared content not found: " + id));
        if (!content.getSharedBy().equals(userId)) {
            throw new RuntimeException("Access denied to share: " + id);
        }
        sharedContentRepository.delete(content);
        log.info("Revoked share {} by user {}", id, userId);
    }

    public ShareAnalyticsDTO getShareAnalytics(UUID id, String userId) {
        SharedContent content = sharedContentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Shared content not found: " + id));
        if (!content.getSharedBy().equals(userId)) {
            throw new RuntimeException("Access denied to share: " + id);
        }

        List<ShareAccessLog> accessLogs = shareAccessLogRepository.findBySharedContentId(id);

        List<ShareAnalyticsDTO.AccessLogEntry> logEntries = accessLogs.stream()
                .map(al -> ShareAnalyticsDTO.AccessLogEntry.builder()
                        .accessedBy(al.getAccessedBy())
                        .accessedByEmail(al.getAccessedByEmail())
                        .accessedAt(al.getAccessedAt())
                        .ipAddress(al.getIpAddress())
                        .userAgent(al.getUserAgent())
                        .build())
                .collect(Collectors.toList());

        return ShareAnalyticsDTO.builder()
                .shareId(id)
                .viewCount(content.getViewCount())
                .accessLog(logEntries)
                .build();
    }

    private String generateSecureToken() {
        byte[] bytes = new byte[32];
        SECURE_RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private ShareDTO toDTO(SharedContent content) {
        return ShareDTO.builder()
                .id(content.getId())
                .messageId(content.getMessageId())
                .conversationId(content.getConversationId())
                .shareType(content.getShareType())
                .recipientEmails(emailsToList(content.getRecipientEmails()))
                .note(content.getNote())
                .includeOriginalQuestion(content.getIncludeOriginalQuestion())
                .includeFullThread(content.getIncludeFullThread())
                .includeCitations(content.getIncludeCitations())
                .shareToken(content.getShareToken())
                .shareLink("/v1/share/link/" + content.getShareToken())
                .expiresAt(content.getExpiresAt())
                .viewCount(content.getViewCount())
                .createdAt(content.getCreatedAt())
                .build();
    }

    private SharedContentViewDTO toViewDTO(SharedContent content) {
        return SharedContentViewDTO.builder()
                .id(content.getId())
                .messageId(content.getMessageId())
                .conversationId(content.getConversationId())
                .shareType(content.getShareType())
                .note(content.getNote())
                .includeOriginalQuestion(content.getIncludeOriginalQuestion())
                .includeFullThread(content.getIncludeFullThread())
                .includeCitations(content.getIncludeCitations())
                .sharedBy(content.getSharedBy())
                .createdAt(content.getCreatedAt())
                .build();
    }

    private String emailsToString(List<String> emails) {
        if (emails == null || emails.isEmpty()) {
            return null;
        }
        return String.join(",", emails);
    }

    private List<String> emailsToList(String emails) {
        if (emails == null || emails.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.asList(emails.split(","));
    }
}
