package com.kyra.security.keys;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantKeyRepository extends JpaRepository<TenantKey, UUID> {
    List<TenantKey> findByTenantIdOrderByCreatedAtDesc(UUID tenantId);
    Optional<TenantKey> findFirstByTenantIdAndState(UUID tenantId, String state);
}
