package com.kyra.sharing.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "shared_content")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SharedContent {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "shared_by", nullable = false)
    private String sharedBy;

    @Column(name = "message_id", nullable = false)
    private UUID messageId;

    @Column(name = "conversation_id", nullable = false)
    private UUID conversationId;

    @Enumerated(EnumType.STRING)
    @Column(name = "share_type", nullable = false)
    private ShareType shareType;

    @Column(name = "recipient_emails", columnDefinition = "TEXT")
    private String recipientEmails;

    @Column(columnDefinition = "TEXT")
    private String note;

    @Column(name = "include_original_question", nullable = false)
    private Boolean includeOriginalQuestion;

    @Column(name = "include_full_thread", nullable = false)
    private Boolean includeFullThread;

    @Column(name = "include_citations", nullable = false)
    private Boolean includeCitations;

    @Column(name = "share_token", nullable = false, unique = true)
    private String shareToken;

    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    @Column(name = "view_count", nullable = false)
    private Integer viewCount;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public enum ShareType {
        EMAIL, TEAMS, SLACK, LINK
    }
}
