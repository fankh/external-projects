package com.kyra.chat.repository;

import com.kyra.chat.model.Message;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface MessageRepository extends JpaRepository<Message, UUID> {

    Page<Message> findByConversationIdOrderByCreatedAt(UUID conversationId, Pageable pageable);

    List<Message> findByConversationIdOrderByCreatedAtDesc(UUID conversationId, Pageable pageable);

    long countByConversationId(UUID conversationId);

    List<Message> findTop10ByConversationIdOrderByCreatedAtDesc(UUID conversationId);

    @org.springframework.data.jpa.repository.Query(value = """
            SELECT m.id, m.conversation_id, m.content, m.role::text, m.created_at
            FROM messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE c.user_id = :userId AND m.content ILIKE :pattern
            ORDER BY m.created_at DESC LIMIT :limit
            """, nativeQuery = true)
    java.util.List<Object[]> searchByUserAndContentRaw(@org.springframework.data.repository.query.Param("userId") java.util.UUID userId,
                                                         @org.springframework.data.repository.query.Param("pattern") String pattern,
                                                         @org.springframework.data.repository.query.Param("limit") int limit);

    default java.util.List<com.kyra.chat.controller.ConversationController.SearchHit> searchByUserAndContent(
            java.util.UUID userId, String pattern, int limit) {
        return searchByUserAndContentRaw(userId, pattern, limit).stream().map(r -> new com.kyra.chat.controller.ConversationController.SearchHit(
                (java.util.UUID) r[0],
                (java.util.UUID) r[1],
                (String) r[2],
                (String) r[3],
                r[4] instanceof java.sql.Timestamp t ? t.toInstant() : (java.time.Instant) r[4]
        )).toList();
    }
}
