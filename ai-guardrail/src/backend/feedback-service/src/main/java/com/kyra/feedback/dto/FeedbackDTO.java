package com.kyra.feedback.dto;

import com.kyra.feedback.model.Feedback;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FeedbackDTO {

    private UUID id;
    private UUID messageId;
    private UUID userId;
    private Feedback.FeedbackRating rating;
    private Integer score;
    private List<String> categories;
    private String comment;
    private Instant createdAt;

    public static FeedbackDTO fromEntity(Feedback feedback) {
        return FeedbackDTO.builder()
                .id(feedback.getId())
                .messageId(feedback.getMessageId())
                .userId(feedback.getUserId())
                .rating(feedback.getRating())
                .score(feedback.getScore())
                .categories(feedback.getCategories())
                .comment(feedback.getComment())
                .createdAt(feedback.getCreatedAt())
                .build();
    }
}
