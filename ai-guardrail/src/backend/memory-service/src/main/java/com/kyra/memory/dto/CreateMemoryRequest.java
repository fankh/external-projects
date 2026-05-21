package com.kyra.memory.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreateMemoryRequest {

    @NotNull(message = "User ID must not be null")
    private UUID userId;

    private UUID conversationId;

    @NotBlank(message = "Memory type must not be blank")
    private String memoryType;

    @NotBlank(message = "Key must not be blank")
    private String key;

    @NotBlank(message = "Value must not be blank")
    private String value;

    private Float importance;

    private Float confidence;

    private UUID sourceMessageId;

    private Map<String, Object> metadata;
}
