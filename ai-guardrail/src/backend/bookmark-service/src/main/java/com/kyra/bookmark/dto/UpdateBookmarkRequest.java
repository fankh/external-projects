package com.kyra.bookmark.dto;

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
public class UpdateBookmarkRequest {

    private String highlightedText;
    private String note;
    private UUID folderId;
    private List<String> tags;
}
