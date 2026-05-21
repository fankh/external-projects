package com.kyra.security.repository;

import com.kyra.security.model.DlpPattern;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface DlpPatternRepository extends JpaRepository<DlpPattern, UUID> {

    List<DlpPattern> findByIsActiveTrue();

    List<DlpPattern> findByCategoryAndIsActive(DlpPattern.Category category, Boolean isActive);
}
