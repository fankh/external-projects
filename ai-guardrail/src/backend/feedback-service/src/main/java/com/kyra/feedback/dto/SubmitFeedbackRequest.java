package com.kyra.feedback.dto;

import com.kyra.feedback.model.Feedback;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SubmitFeedbackRequest {

    @NotNull(message = "messageId is required")
    private UUID messageId;

    @NotNull(message = "rating is required")
    private Feedback.FeedbackRating rating;

    @Min(1)
    @Max(5)
    private Integer score;

    private FeedbackReason reason;

    private List<String> categories;

    private String comment;

    public enum FeedbackReason {
        INACCURATE, INCOMPLETE, OFF_TOPIC, HARMFUL, SLOW,
        HELPFUL, ACCURATE, CLEAR, CREATIVE, THOROUGH
    }
}
