package com.kyra.feedback.repository;

import com.kyra.feedback.model.FeedbackAggregate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Repository
public interface FeedbackAggregateRepository extends JpaRepository<FeedbackAggregate, UUID> {

    List<FeedbackAggregate> findByDateBetween(LocalDate startDate, LocalDate endDate);

    List<FeedbackAggregate> findByPersonaId(UUID personaId);

    List<FeedbackAggregate> findByPersonaIdAndDateBetween(UUID personaId, LocalDate startDate, LocalDate endDate);

    List<FeedbackAggregate> findByTenantIdAndDateBetween(UUID tenantId, LocalDate startDate, LocalDate endDate);

    List<FeedbackAggregate> findByModelIdAndDateBetween(String modelId, LocalDate startDate, LocalDate endDate);
}
