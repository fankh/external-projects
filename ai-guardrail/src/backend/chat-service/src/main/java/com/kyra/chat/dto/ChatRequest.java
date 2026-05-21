package com.kyra.chat.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatRequest {

    private UUID conversationId;

    @NotBlank(message = "Message cannot be blank")
    private String message;

    private String personaId;

    private String purposeId;

    private List<String> ragCollectionIds;

    private Object attachments;
}
