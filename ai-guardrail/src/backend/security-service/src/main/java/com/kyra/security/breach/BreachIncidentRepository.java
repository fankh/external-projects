package com.kyra.security.breach;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface BreachIncidentRepository extends JpaRepository<BreachIncident, UUID> {
    Page<BreachIncident> findAll(Pageable pg);
    List<BreachIncident> findByStatus(String status);

    @Query("SELECT b FROM BreachIncident b WHERE b.authorityNotifiedAt IS NULL AND b.authorityDeadlineAt < :now")
    List<BreachIncident> findAuthorityOverdue(@Param("now") Instant now);

    @Query("SELECT b FROM BreachIncident b WHERE b.highRiskToSubjects = true AND b.subjectsNotifiedAt IS NULL AND b.status IN ('OPEN','UNDER_INVESTIGATION','NOTIFIED')")
    List<BreachIncident> findPendingSubjectNotification();
}
