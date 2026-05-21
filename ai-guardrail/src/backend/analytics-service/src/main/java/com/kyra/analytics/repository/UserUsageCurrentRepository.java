package com.kyra.analytics.repository;

import com.kyra.analytics.model.UserUsageCurrent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserUsageCurrentRepository extends JpaRepository<UserUsageCurrent, UUID> {

    Optional<UserUsageCurrent> findByUserId(UUID userId);
}
