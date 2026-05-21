package com.kyra.bookmark.repository;

import com.kyra.bookmark.model.BookmarkFolder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface BookmarkFolderRepository extends JpaRepository<BookmarkFolder, UUID> {

    List<BookmarkFolder> findByUserIdOrderBySortOrder(String userId);
}
