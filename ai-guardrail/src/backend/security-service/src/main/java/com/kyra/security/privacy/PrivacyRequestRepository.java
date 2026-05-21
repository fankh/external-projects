package com.kyra.security.privacy;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface PrivacyRequestRepository extends JpaRepository<PrivacyRequest, UUID> {
    List<PrivacyRequest> findByUserIdOrderByCreatedAtDesc(UUID userId);
    List<PrivacyRequest> findByStatus(String status);

    @Query("SELECT p FROM PrivacyRequest p WHERE p.hardDeleteAt IS NOT NULL AND p.hardDeleteAt < :now AND p.status = 'IN_PROGRESS'")
    List<PrivacyRequest> findOverdueHardDeletes(@Param("now") Instant now);

    @Query("SELECT p FROM PrivacyRequest p WHERE p.slaDeadlineAt < :now AND p.status IN ('PENDING_VERIFICATION','VERIFIED','IN_PROGRESS')")
    List<PrivacyRequest> findSlaBreached(@Param("now") Instant now);
}
