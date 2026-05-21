package com.kyra.sso.repository;

import com.kyra.sso.model.SsoConfiguration;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SsoConfigurationRepository extends JpaRepository<SsoConfiguration, UUID> {

    List<SsoConfiguration> findByTenantId(UUID tenantId);

    Optional<SsoConfiguration> findByTenantIdAndProviderType(UUID tenantId, String providerType);

    List<SsoConfiguration> findByTenantIdAndIsActive(UUID tenantId, boolean isActive);
}
