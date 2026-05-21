package com.kyra.security.dlp;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository
public interface DlpWhitelistRepository extends JpaRepository<DlpWhitelistRule, UUID> {
    List<DlpWhitelistRule> findByIsActiveTrue();
}
