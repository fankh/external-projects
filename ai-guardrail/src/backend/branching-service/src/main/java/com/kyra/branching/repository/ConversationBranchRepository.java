package com.kyra.branching.repository;

import com.kyra.branching.model.ConversationBranch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ConversationBranchRepository extends JpaRepository<ConversationBranch, UUID> {

    List<ConversationBranch> findByConversationIdOrderByCreatedAtAsc(UUID conversationId);

    @Modifying
    @Query("UPDATE ConversationBranch b SET b.isActive = false WHERE b.conversationId = :conversationId")
    void deactivateAllBranches(@Param("conversationId") UUID conversationId);
}
