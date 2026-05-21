package com.kyra.chat.repository;

import com.kyra.chat.model.Conversation;
import com.kyra.chat.model.Conversation.ConversationStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface ConversationRepository extends JpaRepository<Conversation, UUID> {

    List<Conversation> findByUserIdAndStatus(String userId, ConversationStatus status);

    Page<Conversation> findByUserIdOrderByLastMessageAtDesc(String userId, Pageable pageable);

    Page<Conversation> findByUserIdAndStatusOrderByLastMessageAtDesc(
            String userId, ConversationStatus status, Pageable pageable);
}
