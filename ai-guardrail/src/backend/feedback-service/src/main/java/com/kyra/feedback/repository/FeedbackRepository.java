package com.kyra.feedback.repository;

import com.kyra.feedback.model.Feedback;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FeedbackRepository extends JpaRepository<Feedback, UUID> {

    List<Feedback> findByMessageId(UUID messageId);

    Optional<Feedback> findByMessageIdAndUserId(UUID messageId, UUID userId);

    Page<Feedback> findByUserId(UUID userId, Pageable pageable);

    long countByRating(Feedback.FeedbackRating rating);

    long countByRatingAndCreatedAtBetween(Feedback.FeedbackRating rating, Instant start, Instant end);

    List<Feedback> findByCreatedAtBetween(Instant start, Instant end);

    @Query("SELECT f.rating, COUNT(f) FROM Feedback f WHERE f.createdAt BETWEEN :start AND :end GROUP BY f.rating")
    List<Object[]> countByRatingGrouped(@Param("start") Instant start, @Param("end") Instant end);

    @Query("SELECT CAST(f.createdAt AS LocalDate), f.rating, COUNT(f) FROM Feedback f " +
            "WHERE f.createdAt BETWEEN :start AND :end GROUP BY CAST(f.createdAt AS LocalDate), f.rating " +
            "ORDER BY CAST(f.createdAt AS LocalDate)")
    List<Object[]> findDailyTrends(@Param("start") Instant start, @Param("end") Instant end);

    @Query("SELECT c, COUNT(f) FROM Feedback f JOIN f.categories c WHERE f.createdAt BETWEEN :start AND :end " +
            "GROUP BY c ORDER BY COUNT(f) DESC")
    List<Object[]> findTopCategories(@Param("start") Instant start, @Param("end") Instant end);
}
