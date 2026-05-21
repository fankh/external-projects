package com.kyra.bookmark.service;

import com.kyra.bookmark.dto.BookmarkFolderDTO;
import com.kyra.bookmark.dto.CreateFolderRequest;
import com.kyra.bookmark.model.BookmarkFolder;
import com.kyra.bookmark.repository.BookmarkFolderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class BookmarkFolderService {

    private final BookmarkFolderRepository bookmarkFolderRepository;

    public List<BookmarkFolderDTO> listFolders(String userId) {
        return bookmarkFolderRepository.findByUserIdOrderBySortOrder(userId)
                .stream()
                .map(this::toDTO)
                .toList();
    }

    @Transactional
    public BookmarkFolderDTO createFolder(CreateFolderRequest request, String userId) {
        List<BookmarkFolder> existing = bookmarkFolderRepository.findByUserIdOrderBySortOrder(userId);
        int nextSort = existing.isEmpty() ? 0 : existing.getLast().getSortOrder() + 1;

        BookmarkFolder folder = BookmarkFolder.builder()
                .userId(userId)
                .name(request.getName())
                .color(request.getColor())
                .sortOrder(nextSort)
                .build();
        folder = bookmarkFolderRepository.save(folder);
        log.info("Created folder {} for user {}", folder.getId(), userId);
        return toDTO(folder);
    }

    @Transactional
    public BookmarkFolderDTO updateFolder(UUID id, CreateFolderRequest request, String userId) {
        BookmarkFolder folder = bookmarkFolderRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Folder not found: " + id));
        if (!folder.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to folder: " + id);
        }
        if (request.getName() != null) {
            folder.setName(request.getName());
        }
        if (request.getColor() != null) {
            folder.setColor(request.getColor());
        }
        folder = bookmarkFolderRepository.save(folder);
        log.info("Updated folder {} for user {}", id, userId);
        return toDTO(folder);
    }

    @Transactional
    public void deleteFolder(UUID id, String userId) {
        BookmarkFolder folder = bookmarkFolderRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Folder not found: " + id));
        if (!folder.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to folder: " + id);
        }
        bookmarkFolderRepository.delete(folder);
        log.info("Deleted folder {} for user {}", id, userId);
    }

    @Transactional
    public List<BookmarkFolderDTO> reorderFolders(List<UUID> folderIds, String userId) {
        List<BookmarkFolder> folders = bookmarkFolderRepository.findByUserIdOrderBySortOrder(userId);

        for (int i = 0; i < folderIds.size(); i++) {
            UUID folderId = folderIds.get(i);
            for (BookmarkFolder folder : folders) {
                if (folder.getId().equals(folderId)) {
                    folder.setSortOrder(i);
                    bookmarkFolderRepository.save(folder);
                    break;
                }
            }
        }

        log.info("Reordered {} folders for user {}", folderIds.size(), userId);
        return bookmarkFolderRepository.findByUserIdOrderBySortOrder(userId)
                .stream()
                .map(this::toDTO)
                .toList();
    }

    private BookmarkFolderDTO toDTO(BookmarkFolder folder) {
        return BookmarkFolderDTO.builder()
                .id(folder.getId())
                .name(folder.getName())
                .color(folder.getColor())
                .sortOrder(folder.getSortOrder())
                .createdAt(folder.getCreatedAt())
                .build();
    }
}
