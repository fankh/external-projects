package com.kyra.insights.repository;

import com.kyra.insights.model.UserUsageStats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface UserUsageStatsRepository extends JpaRepository<UserUsageStats, UUID> {

    List<UserUsageStats> findByUserIdAndDateBetweenOrderByDateAsc(UUID userId, LocalDate startDate, LocalDate endDate);

    @Query("SELECT COALESCE(SUM(u.queryCount), 0) FROM UserUsageStats u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate")
    Integer sumQueryCountByUserIdAndDateBetween(@Param("userId") UUID userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT COALESCE(SUM(u.documentCount), 0) FROM UserUsageStats u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate")
    Integer sumDocumentCountByUserIdAndDateBetween(@Param("userId") UUID userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT COALESCE(SUM(u.tokenCount), 0) FROM UserUsageStats u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate")
    Integer sumTokenCountByUserIdAndDateBetween(@Param("userId") UUID userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT COALESCE(SUM(u.conversationCount), 0) FROM UserUsageStats u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate")
    Integer sumConversationCountByUserIdAndDateBetween(@Param("userId") UUID userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT COALESCE(SUM(u.bookmarkCount), 0) FROM UserUsageStats u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate")
    Integer sumBookmarkCountByUserIdAndDateBetween(@Param("userId") UUID userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);

    @Query("SELECT COALESCE(SUM(u.estimatedMinutesSaved), 0) FROM UserUsageStats u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate")
    Integer sumEstimatedMinutesSavedByUserIdAndDateBetween(@Param("userId") UUID userId, @Param("startDate") LocalDate startDate, @Param("endDate") LocalDate endDate);
}
