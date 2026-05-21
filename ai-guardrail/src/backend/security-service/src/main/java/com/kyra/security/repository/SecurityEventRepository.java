package com.kyra.security.repository;

import com.kyra.security.model.SecurityEvent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Repository
public interface SecurityEventRepository extends JpaRepository<SecurityEvent, UUID> {

    List<SecurityEvent> findByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserIdAndCreatedAtAfter(UUID userId, Instant after);

    List<SecurityEvent> findByReviewedFalse();

    Page<SecurityEvent> findAll(Pageable pageable);

    Page<SecurityEvent> findByUserId(UUID userId, Pageable pageable);

    Page<SecurityEvent> findByEventType(SecurityEvent.EventType eventType, Pageable pageable);
}
