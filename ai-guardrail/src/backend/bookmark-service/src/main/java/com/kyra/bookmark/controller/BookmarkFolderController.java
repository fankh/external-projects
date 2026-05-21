package com.kyra.bookmark.controller;

import com.kyra.bookmark.config.SecurityConfig;
import com.kyra.bookmark.config.SecurityConfig.UserContext;
import com.kyra.bookmark.dto.BookmarkFolderDTO;
import com.kyra.bookmark.dto.CreateFolderRequest;
import com.kyra.bookmark.service.BookmarkFolderService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/bookmarks/folders")
@RequiredArgsConstructor
public class BookmarkFolderController {

    private final BookmarkFolderService bookmarkFolderService;

    @GetMapping
    public List<BookmarkFolderDTO> listFolders(HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkFolderService.listFolders(user.getUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookmarkFolderDTO createFolder(
            @Valid @RequestBody CreateFolderRequest createRequest,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkFolderService.createFolder(createRequest, user.getUserId());
    }

    @PutMapping("/{id}")
    public BookmarkFolderDTO updateFolder(
            @PathVariable UUID id,
            @RequestBody CreateFolderRequest updateRequest,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkFolderService.updateFolder(id, updateRequest, user.getUserId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFolder(
            @PathVariable UUID id,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        bookmarkFolderService.deleteFolder(id, user.getUserId());
    }

    @PutMapping("/reorder")
    public List<BookmarkFolderDTO> reorderFolders(
            @RequestBody List<UUID> folderIds,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkFolderService.reorderFolders(folderIds, user.getUserId());
    }

    private UserContext getUserContext(HttpServletRequest request) {
        return (UserContext) request.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }
}
