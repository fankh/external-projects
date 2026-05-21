package com.kyra.tenant.repository;

import com.kyra.tenant.model.Tenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface TenantRepository extends JpaRepository<Tenant, UUID> {

    Optional<Tenant> findBySlug(String slug);

    List<Tenant> findByStatus(Tenant.TenantStatus status);

    List<Tenant> findByOwnerId(UUID ownerId);

    boolean existsBySlug(String slug);
}
