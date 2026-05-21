package com.kyra.sharing.repository;

import com.kyra.sharing.model.SharedContent;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface SharedContentRepository extends JpaRepository<SharedContent, UUID> {

    Page<SharedContent> findBySharedBy(String sharedBy, Pageable pageable);

    Optional<SharedContent> findByShareToken(String shareToken);
}
