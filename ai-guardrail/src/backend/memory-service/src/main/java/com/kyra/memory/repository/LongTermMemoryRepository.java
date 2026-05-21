package com.kyra.memory.repository;

import com.kyra.memory.model.LongTermMemory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface LongTermMemoryRepository extends JpaRepository<LongTermMemory, UUID> {

    List<LongTermMemory> findByUserIdAndStatus(UUID userId, LongTermMemory.MemoryStatus status);

    List<LongTermMemory> findByUserIdAndMemoryType(UUID userId, LongTermMemory.MemoryType memoryType);

    Page<LongTermMemory> findByUserId(UUID userId, Pageable pageable);

    Page<LongTermMemory> findByUserIdAndMemoryType(UUID userId, LongTermMemory.MemoryType memoryType, Pageable pageable);

    @Query(value = """
            SELECT * FROM long_term_memories m
            WHERE m.user_id = :userId AND m.status = 'ACTIVE'
            ORDER BY (0.4 * m.importance
                    + 0.3 * (1.0 / (1.0 + EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - m.created_at)) / 86400.0))
                    + 0.3 * (CAST(m.access_count AS float) / (SELECT COALESCE(MAX(m2.access_count), 1) FROM long_term_memories m2 WHERE m2.user_id = :userId)))
                DESC
            """, nativeQuery = true)
    List<LongTermMemory> findRelevant(@Param("userId") UUID userId, Pageable pageable);

    long countByUserIdAndStatus(UUID userId, LongTermMemory.MemoryStatus status);

    long countByUserIdAndMemoryType(UUID userId, LongTermMemory.MemoryType memoryType);

    long countByUserId(UUID userId);

    List<LongTermMemory> findByUserIdAndStatusOrderByImportanceAsc(UUID userId, LongTermMemory.MemoryStatus status);
}
