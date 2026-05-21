package com.kyra.memory.repository;

import com.kyra.memory.model.MemorySummary;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MemorySummaryRepository extends JpaRepository<MemorySummary, UUID> {

    List<MemorySummary> findByConversationId(UUID conversationId);

    List<MemorySummary> findByConversationIdOrderByMessageRangeStartDesc(UUID conversationId);

    List<MemorySummary> findByUserId(UUID userId);
}
