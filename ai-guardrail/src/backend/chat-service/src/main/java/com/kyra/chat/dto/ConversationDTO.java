package com.kyra.chat.dto;

import com.kyra.chat.model.Conversation.ConversationStatus;
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
public class ConversationDTO {

    private UUID id;
    private String title;
    private String personaId;
    private String personaName;
    private ConversationStatus status;
    private Boolean isPinned;
    private Integer messageCount;
    private LocalDateTime lastMessageAt;
    private LocalDateTime createdAt;
}
