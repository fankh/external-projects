package com.kyra.feedback.service;

import com.kyra.feedback.dto.*;
import com.kyra.feedback.model.Feedback;
import com.kyra.feedback.repository.FeedbackAggregateRepository;
import com.kyra.feedback.repository.FeedbackRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class FeedbackService {

    private final FeedbackRepository feedbackRepository;
    private final FeedbackAggregateRepository feedbackAggregateRepository;

    @Transactional
    public FeedbackDTO submitFeedback(UUID userId, SubmitFeedbackRequest request) {
        log.info("Submitting feedback for message {} by user {}", request.getMessageId(), userId);

        List<String> categories = request.getCategories() != null
                ? new ArrayList<>(request.getCategories())
                : new ArrayList<>();

        if (request.getReason() != null && !categories.contains(request.getReason().name())) {
            categories.add(request.getReason().name());
        }

        Feedback feedback = Feedback.builder()
                .messageId(request.getMessageId())
                .userId(userId)
                .rating(request.getRating())
                .score(request.getScore())
                .categories(categories)
                .comment(request.getComment())
                .build();

        try {
            feedback = feedbackRepository.save(feedback);
        } catch (DataIntegrityViolationException e) {
            log.warn("Duplicate feedback for message {} by user {}", request.getMessageId(), userId);
            throw new IllegalStateException("Feedback already submitted for this message by this user");
        }

        return FeedbackDTO.fromEntity(feedback);
    }

    @Transactional(readOnly = true)
    public List<FeedbackDTO> getFeedbackForMessage(UUID messageId) {
        return feedbackRepository.findByMessageId(messageId).stream()
                .map(FeedbackDTO::fromEntity)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public Page<FeedbackDTO> getFeedbackByUser(UUID userId, Pageable pageable) {
        return feedbackRepository.findByUserId(userId, pageable)
                .map(FeedbackDTO::fromEntity);
    }

    @Transactional
    public FeedbackDTO updateFeedback(UUID feedbackId, SubmitFeedbackRequest request) {
        Feedback feedback = feedbackRepository.findById(feedbackId)
                .orElseThrow(() -> new NoSuchElementException("Feedback not found: " + feedbackId));

        if (request.getRating() != null) {
            feedback.setRating(request.getRating());
        }
        if (request.getScore() != null) {
            feedback.setScore(request.getScore());
        }
        if (request.getComment() != null) {
            feedback.setComment(request.getComment());
        }
        if (request.getCategories() != null) {
            List<String> categories = new ArrayList<>(request.getCategories());
            if (request.getReason() != null && !categories.contains(request.getReason().name())) {
                categories.add(request.getReason().name());
            }
            feedback.setCategories(categories);
        }

        feedback = feedbackRepository.save(feedback);
        return FeedbackDTO.fromEntity(feedback);
    }

    @Transactional(readOnly = true)
    public FeedbackStatsDTO getStats(UUID personaId, Instant startDate, Instant endDate) {
        if (startDate == null) {
            startDate = Instant.now().minus(30, ChronoUnit.DAYS);
        }
        if (endDate == null) {
            endDate = Instant.now();
        }

        long totalPositive = feedbackRepository.countByRatingAndCreatedAtBetween(
                Feedback.FeedbackRating.POSITIVE, startDate, endDate);
        long totalNegative = feedbackRepository.countByRatingAndCreatedAtBetween(
                Feedback.FeedbackRating.NEGATIVE, startDate, endDate);

        double satisfactionRate = (totalPositive + totalNegative) > 0
                ? (double) totalPositive / (totalPositive + totalNegative) * 100.0
                : 0.0;

        List<Object[]> topCategoriesRaw = feedbackRepository.findTopCategories(startDate, endDate);
        Map<String, Long> topReasons = new LinkedHashMap<>();
        for (Object[] row : topCategoriesRaw) {
            topReasons.put((String) row[0], (Long) row[1]);
        }

        return FeedbackStatsDTO.builder()
                .totalPositive(totalPositive)
                .totalNegative(totalNegative)
                .satisfactionRate(Math.round(satisfactionRate * 100.0) / 100.0)
                .topReasons(topReasons)
                .build();
    }

    @Transactional(readOnly = true)
    public List<FeedbackTrendDTO> getTrends(int days) {
        Instant start = Instant.now().minus(days, ChronoUnit.DAYS);
        Instant end = Instant.now();

        List<Object[]> rawTrends = feedbackRepository.findDailyTrends(start, end);

        Map<LocalDate, FeedbackTrendDTO> trendMap = new LinkedHashMap<>();

        // Pre-fill all days
        for (int i = days; i >= 0; i--) {
            LocalDate date = LocalDate.now().minusDays(i);
            trendMap.put(date, FeedbackTrendDTO.builder()
                    .date(date)
                    .positive(0)
                    .negative(0)
                    .build());
        }

        for (Object[] row : rawTrends) {
            LocalDate date = (LocalDate) row[0];
            Feedback.FeedbackRating rating = (Feedback.FeedbackRating) row[1];
            long count = (Long) row[2];

            FeedbackTrendDTO trend = trendMap.get(date);
            if (trend != null) {
                if (rating == Feedback.FeedbackRating.POSITIVE) {
                    trend.setPositive(count);
                } else {
                    trend.setNegative(count);
                }
            }
        }

        return new ArrayList<>(trendMap.values());
    }

    @Transactional(readOnly = true)
    public String exportAsCsv(Instant startDate, Instant endDate) {
        if (startDate == null) {
            startDate = Instant.now().minus(30, ChronoUnit.DAYS);
        }
        if (endDate == null) {
            endDate = Instant.now();
        }

        List<Feedback> feedbacks = feedbackRepository.findByCreatedAtBetween(startDate, endDate);

        StringBuilder sb = new StringBuilder();
        sb.append("id,message_id,user_id,rating,score,categories,comment,created_at\n");

        for (Feedback f : feedbacks) {
            sb.append(f.getId()).append(",");
            sb.append(f.getMessageId()).append(",");
            sb.append(f.getUserId()).append(",");
            sb.append(f.getRating()).append(",");
            sb.append(f.getScore() != null ? f.getScore() : "").append(",");
            sb.append("\"").append(f.getCategories() != null ? String.join(";", f.getCategories()) : "").append("\",");
            sb.append("\"").append(escapeCsv(f.getComment())).append("\",");
            sb.append(f.getCreatedAt()).append("\n");
        }

        return sb.toString();
    }

    private String escapeCsv(String value) {
        if (value == null) return "";
        return value.replace("\"", "\"\"");
    }
}
