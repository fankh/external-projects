package com.kyra.bookmark.dto;

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
public class BookmarkFolderDTO {

    private UUID id;
    private String name;
    private String color;
    private Integer sortOrder;
    private LocalDateTime createdAt;
}
