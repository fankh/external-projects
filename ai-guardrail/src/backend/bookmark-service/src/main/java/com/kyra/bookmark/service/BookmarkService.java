package com.kyra.bookmark.service;

import com.kyra.bookmark.dto.BookmarkDTO;
import com.kyra.bookmark.dto.CreateBookmarkRequest;
import com.kyra.bookmark.dto.UpdateBookmarkRequest;
import com.kyra.bookmark.model.Bookmark;
import com.kyra.bookmark.repository.BookmarkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class BookmarkService {

    private final BookmarkRepository bookmarkRepository;

    public Page<BookmarkDTO> listBookmarks(String userId, UUID folderId, String tag, Pageable pageable) {
        if (folderId != null) {
            return bookmarkRepository.findByUserIdAndFolderId(userId, folderId, pageable)
                    .map(this::toDTO);
        }
        if (tag != null && !tag.isBlank()) {
            return bookmarkRepository.findByUserIdAndTag(userId, tag, pageable)
                    .map(this::toDTO);
        }
        return bookmarkRepository.findByUserId(userId, pageable)
                .map(this::toDTO);
    }

    public BookmarkDTO getBookmark(UUID id, String userId) {
        Bookmark bookmark = bookmarkRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bookmark not found: " + id));
        if (!bookmark.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to bookmark: " + id);
        }
        return toDTO(bookmark);
    }

    @Transactional
    public BookmarkDTO createBookmark(CreateBookmarkRequest request, String userId) {
        Bookmark bookmark = Bookmark.builder()
                .userId(userId)
                .conversationId(request.getConversationId())
                .messageId(request.getMessageId())
                .highlightedText(request.getHighlightedText())
                .note(request.getNote())
                .folderId(request.getFolderId())
                .tags(tagsToString(request.getTags()))
                .build();
        bookmark = bookmarkRepository.save(bookmark);
        log.info("Created bookmark {} for user {}", bookmark.getId(), userId);
        return toDTO(bookmark);
    }

    @Transactional
    public BookmarkDTO updateBookmark(UUID id, UpdateBookmarkRequest request, String userId) {
        Bookmark bookmark = bookmarkRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bookmark not found: " + id));
        if (!bookmark.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to bookmark: " + id);
        }
        if (request.getHighlightedText() != null) {
            bookmark.setHighlightedText(request.getHighlightedText());
        }
        if (request.getNote() != null) {
            bookmark.setNote(request.getNote());
        }
        if (request.getFolderId() != null) {
            bookmark.setFolderId(request.getFolderId());
        }
        if (request.getTags() != null) {
            bookmark.setTags(tagsToString(request.getTags()));
        }
        bookmark = bookmarkRepository.save(bookmark);
        log.info("Updated bookmark {} for user {}", id, userId);
        return toDTO(bookmark);
    }

    @Transactional
    public void deleteBookmark(UUID id, String userId) {
        Bookmark bookmark = bookmarkRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Bookmark not found: " + id));
        if (!bookmark.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to bookmark: " + id);
        }
        bookmarkRepository.delete(bookmark);
        log.info("Deleted bookmark {} for user {}", id, userId);
    }

    public Page<BookmarkDTO> searchBookmarks(String userId, String query, Pageable pageable) {
        return bookmarkRepository.searchByText(userId, query, pageable)
                .map(this::toDTO);
    }

    private BookmarkDTO toDTO(Bookmark bookmark) {
        return BookmarkDTO.builder()
                .id(bookmark.getId())
                .conversationId(bookmark.getConversationId())
                .messageId(bookmark.getMessageId())
                .highlightedText(bookmark.getHighlightedText())
                .note(bookmark.getNote())
                .folderId(bookmark.getFolderId())
                .tags(tagsToList(bookmark.getTags()))
                .createdAt(bookmark.getCreatedAt())
                .updatedAt(bookmark.getUpdatedAt())
                .build();
    }

    private String tagsToString(List<String> tags) {
        if (tags == null || tags.isEmpty()) {
            return null;
        }
        return String.join(",", tags);
    }

    private List<String> tagsToList(String tags) {
        if (tags == null || tags.isBlank()) {
            return Collections.emptyList();
        }
        return Arrays.asList(tags.split(","));
    }
}
