package com.kyra.bookmark.repository;

import com.kyra.bookmark.model.Bookmark;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BookmarkRepository extends JpaRepository<Bookmark, UUID> {

    Page<Bookmark> findByUserId(String userId, Pageable pageable);

    Page<Bookmark> findByUserIdAndFolderId(String userId, UUID folderId, Pageable pageable);

    @Query("SELECT b FROM Bookmark b WHERE b.userId = :userId AND b.tags LIKE %:tag%")
    Page<Bookmark> findByUserIdAndTag(@Param("userId") String userId, @Param("tag") String tag, Pageable pageable);

    @Query("SELECT b FROM Bookmark b WHERE b.userId = :userId " +
            "AND (LOWER(b.highlightedText) LIKE LOWER(CONCAT('%', :query, '%')) " +
            "OR LOWER(b.note) LIKE LOWER(CONCAT('%', :query, '%')))")
    Page<Bookmark> searchByText(@Param("userId") String userId, @Param("query") String query, Pageable pageable);

    List<Bookmark> findByUserIdAndConversationId(String userId, UUID conversationId);
}
