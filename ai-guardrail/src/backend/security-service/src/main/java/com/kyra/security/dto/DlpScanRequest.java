package com.kyra.security.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import lombok.*;

import java.util.Map;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DlpScanRequest {

    @NotBlank(message = "Content must not be blank")
    private String content;

    @NotNull(message = "User ID must not be null")
    private UUID userId;

    @Pattern(regexp = "^(input|output)$", message = "Direction must be 'input' or 'output'")
    private String direction;

    private UUID conversationId;

    private Map<String, Object> metadata;
}
