package com.kyra.bookmark.controller;

import com.kyra.bookmark.config.SecurityConfig;
import com.kyra.bookmark.config.SecurityConfig.UserContext;
import com.kyra.bookmark.dto.BookmarkDTO;
import com.kyra.bookmark.dto.CreateBookmarkRequest;
import com.kyra.bookmark.dto.UpdateBookmarkRequest;
import com.kyra.bookmark.service.BookmarkService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/v1/bookmarks")
@RequiredArgsConstructor
public class BookmarkController {

    private final BookmarkService bookmarkService;

    @GetMapping
    public Page<BookmarkDTO> listBookmarks(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) UUID folderId,
            @RequestParam(required = false) String tag,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkService.listBookmarks(
                user.getUserId(), folderId, tag,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @GetMapping("/{id}")
    public BookmarkDTO getBookmark(
            @PathVariable UUID id,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkService.getBookmark(id, user.getUserId());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BookmarkDTO createBookmark(
            @Valid @RequestBody CreateBookmarkRequest createRequest,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkService.createBookmark(createRequest, user.getUserId());
    }

    @PutMapping("/{id}")
    public BookmarkDTO updateBookmark(
            @PathVariable UUID id,
            @RequestBody UpdateBookmarkRequest updateRequest,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkService.updateBookmark(id, updateRequest, user.getUserId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBookmark(
            @PathVariable UUID id,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        bookmarkService.deleteBookmark(id, user.getUserId());
    }

    @GetMapping("/search")
    public Page<BookmarkDTO> searchBookmarks(
            @RequestParam String query,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return bookmarkService.searchBookmarks(
                user.getUserId(), query,
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    private UserContext getUserContext(HttpServletRequest request) {
        return (UserContext) request.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }
}
