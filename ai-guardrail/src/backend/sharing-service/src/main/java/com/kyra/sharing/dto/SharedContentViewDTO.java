package com.kyra.sharing.dto;

import com.kyra.sharing.model.SharedContent.ShareType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SharedContentViewDTO {

    private UUID id;
    private UUID messageId;
    private UUID conversationId;
    private ShareType shareType;
    private String note;
    private Boolean includeOriginalQuestion;
    private Boolean includeFullThread;
    private Boolean includeCitations;
    private String sharedBy;
    private LocalDateTime createdAt;
}
