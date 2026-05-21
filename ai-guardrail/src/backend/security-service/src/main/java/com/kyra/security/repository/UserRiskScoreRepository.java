package com.kyra.security.repository;

import com.kyra.security.model.UserRiskScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRiskScoreRepository extends JpaRepository<UserRiskScore, UUID> {

    Optional<UserRiskScore> findByUserId(UUID userId);

    List<UserRiskScore> findByRiskLevelIn(List<UserRiskScore.RiskLevel> riskLevels);
}
