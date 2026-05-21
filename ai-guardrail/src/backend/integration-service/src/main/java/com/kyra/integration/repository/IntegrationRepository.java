package com.kyra.integration.repository;

import com.kyra.integration.model.Integration;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface IntegrationRepository extends JpaRepository<Integration, UUID> {

    Page<Integration> findByTenantIdOrderByCreatedAtDesc(UUID tenantId, Pageable pageable);

    List<Integration> findByTenantId(UUID tenantId);

    Optional<Integration> findByIdAndTenantId(UUID id, UUID tenantId);

    List<Integration> findByTenantIdAndType(UUID tenantId, Integration.IntegrationType type);

    List<Integration> findByTenantIdAndStatus(UUID tenantId, Integration.IntegrationStatus status);
}
