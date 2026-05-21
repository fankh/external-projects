package com.kyra.sharing.controller;

import com.kyra.sharing.config.SecurityConfig;
import com.kyra.sharing.config.SecurityConfig.UserContext;
import com.kyra.sharing.dto.ShareAnalyticsDTO;
import com.kyra.sharing.dto.ShareDTO;
import com.kyra.sharing.dto.ShareRequest;
import com.kyra.sharing.dto.SharedContentViewDTO;
import com.kyra.sharing.service.SharingService;
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
@RequestMapping("/v1/share")
@RequiredArgsConstructor
public class SharingController {

    private final SharingService sharingService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ShareDTO shareContent(
            @Valid @RequestBody ShareRequest shareRequest,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return sharingService.shareContent(shareRequest, user.getUserId());
    }

    @GetMapping("/link/{token}")
    public SharedContentViewDTO viewSharedContent(
            @PathVariable String token,
            HttpServletRequest request) {
        String ipAddress = request.getRemoteAddr();
        String userAgent = request.getHeader("User-Agent");
        return sharingService.viewSharedContent(token, ipAddress, userAgent);
    }

    @GetMapping("/my-shares")
    public Page<ShareDTO> getMyShares(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return sharingService.getMyShares(
                user.getUserId(),
                PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt")));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revokeShare(
            @PathVariable UUID id,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        sharingService.revokeShare(id, user.getUserId());
    }

    @GetMapping("/{id}/analytics")
    public ShareAnalyticsDTO getShareAnalytics(
            @PathVariable UUID id,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return sharingService.getShareAnalytics(id, user.getUserId());
    }

    private UserContext getUserContext(HttpServletRequest request) {
        return (UserContext) request.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }
}
