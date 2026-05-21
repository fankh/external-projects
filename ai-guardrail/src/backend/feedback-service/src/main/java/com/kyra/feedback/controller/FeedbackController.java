package com.kyra.feedback.controller;

import com.kyra.feedback.dto.*;
import com.kyra.feedback.service.FeedbackService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/feedback")
@RequiredArgsConstructor
@Slf4j
public class FeedbackController {

    private final FeedbackService feedbackService;

    @PostMapping
    public ResponseEntity<FeedbackDTO> submitFeedback(
            @RequestHeader(value = "X-User-Id", required = false) UUID userId,
            @Valid @RequestBody SubmitFeedbackRequest request) {

        if (userId == null) {
            userId = UUID.randomUUID(); // fallback for anonymous
        }

        try {
            FeedbackDTO result = feedbackService.submitFeedback(userId, request);
            return ResponseEntity.status(HttpStatus.CREATED).body(result);
        } catch (IllegalStateException e) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    @GetMapping("/message/{messageId}")
    public ResponseEntity<List<FeedbackDTO>> getFeedbackForMessage(@PathVariable UUID messageId) {
        List<FeedbackDTO> feedbacks = feedbackService.getFeedbackForMessage(messageId);
        return ResponseEntity.ok(feedbacks);
    }

    @PutMapping("/{id}")
    public ResponseEntity<FeedbackDTO> updateFeedback(
            @PathVariable UUID id,
            @Valid @RequestBody SubmitFeedbackRequest request) {

        try {
            FeedbackDTO result = feedbackService.updateFeedback(id, request);
            return ResponseEntity.ok(result);
        } catch (java.util.NoSuchElementException e) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/stats")
    public ResponseEntity<FeedbackStatsDTO> getStats(
            @RequestParam(required = false) UUID personaId,
            @RequestParam(required = false) Instant startDate,
            @RequestParam(required = false) Instant endDate) {

        FeedbackStatsDTO stats = feedbackService.getStats(personaId, startDate, endDate);
        return ResponseEntity.ok(stats);
    }

    @GetMapping("/trends")
    public ResponseEntity<List<FeedbackTrendDTO>> getTrends(
            @RequestParam(defaultValue = "30") int days) {

        List<FeedbackTrendDTO> trends = feedbackService.getTrends(days);
        return ResponseEntity.ok(trends);
    }

    @GetMapping("/export")
    public ResponseEntity<String> exportCsv(
            @RequestParam(required = false) Instant startDate,
            @RequestParam(required = false) Instant endDate) {

        String csv = feedbackService.exportAsCsv(startDate, endDate);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=feedback_export.csv")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(csv);
    }
}
