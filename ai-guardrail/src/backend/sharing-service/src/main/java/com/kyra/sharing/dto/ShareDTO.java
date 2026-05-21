package com.kyra.sharing.dto;

import com.kyra.sharing.model.SharedContent.ShareType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ShareDTO {

    private UUID id;
    private UUID messageId;
    private UUID conversationId;
    private ShareType shareType;
    private List<String> recipientEmails;
    private String note;
    private Boolean includeOriginalQuestion;
    private Boolean includeFullThread;
    private Boolean includeCitations;
    private String shareToken;
    private String shareLink;
    private LocalDateTime expiresAt;
    private Integer viewCount;
    private LocalDateTime createdAt;
}
