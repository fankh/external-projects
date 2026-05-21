package com.kyra.security.uba;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
interface UserBehaviorProfileRepository extends JpaRepository<UserBehaviorProfile, UUID> {
    List<UserBehaviorProfile> findTop20ByOrderByRiskScoreDesc();
}

@Repository
interface UserAnomalyRepository extends JpaRepository<UserAnomaly, UUID> {
    List<UserAnomaly> findByUserIdOrderByDetectedAtDesc(UUID userId);
    Page<UserAnomaly> findByAcknowledgedFalse(Pageable pg);
    List<UserAnomaly> findTop50ByOrderByDetectedAtDesc();
}
