package com.kyra.analytics.repository;

import com.kyra.analytics.model.UsageDaily;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface UsageDailyRepository extends JpaRepository<UsageDaily, UUID> {

    List<UsageDaily> findByUserIdAndDateBetween(UUID userId, LocalDate startDate, LocalDate endDate);

    @Query("SELECT u FROM UsageDaily u WHERE u.departmentId = :deptId AND u.date BETWEEN :startDate AND :endDate")
    List<UsageDaily> findByDepartmentIdAndDateBetween(
            @Param("deptId") UUID departmentId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT u.personaId, SUM(u.queryCount), SUM(u.tokenCount) " +
           "FROM UsageDaily u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate " +
           "GROUP BY u.personaId")
    List<Object[]> aggregateByPersona(
            @Param("userId") UUID userId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT u.departmentId, SUM(u.queryCount), SUM(u.tokenCount), SUM(u.estimatedCost) " +
           "FROM UsageDaily u WHERE u.date BETWEEN :startDate AND :endDate " +
           "GROUP BY u.departmentId")
    List<Object[]> aggregateByDepartment(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT u.date, SUM(u.queryCount), SUM(u.tokenCount) " +
           "FROM UsageDaily u WHERE u.userId = :userId AND u.date BETWEEN :startDate AND :endDate " +
           "GROUP BY u.date ORDER BY u.date")
    List<Object[]> aggregateByDay(
            @Param("userId") UUID userId,
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    @Query("SELECT SUM(u.queryCount), SUM(u.tokenCount), SUM(u.estimatedCost), COUNT(DISTINCT u.userId) " +
           "FROM UsageDaily u WHERE u.date BETWEEN :startDate AND :endDate")
    Object[] systemOverview(
            @Param("startDate") LocalDate startDate,
            @Param("endDate") LocalDate endDate);

    List<UsageDaily> findByUserIdAndDateAndPersonaId(UUID userId, LocalDate date, UUID personaId);
}
