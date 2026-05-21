package com.kyra.chat.dto;

import com.kyra.chat.model.Message.MessageRole;
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
public class MessageDTO {

    private UUID id;
    private MessageRole role;
    private String content;
    private String personaId;
    private Object ragSources;
    private ChatResponse.TokenUsage tokens;
    private LocalDateTime createdAt;
}
