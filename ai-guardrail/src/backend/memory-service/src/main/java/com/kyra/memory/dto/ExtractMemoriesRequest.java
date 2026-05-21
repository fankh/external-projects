package com.kyra.memory.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExtractMemoriesRequest {

    @NotNull(message = "User ID must not be null")
    private UUID userId;

    @NotNull(message = "Conversation ID must not be null")
    private UUID conversationId;

    @NotEmpty(message = "Messages must not be empty")
    private List<Map<String, Object>> messages;
}
