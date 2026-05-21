package com.kyra.branching.controller;

import com.kyra.branching.config.SecurityConfig;
import com.kyra.branching.config.SecurityConfig.UserContext;
import com.kyra.branching.dto.BranchComparisonDTO;
import com.kyra.branching.dto.BranchDTO;
import com.kyra.branching.dto.CreateBranchRequest;
import com.kyra.branching.service.BranchingService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/v1/conversations/{conversationId}/branches")
@RequiredArgsConstructor
public class BranchController {

    private final BranchingService branchingService;

    @GetMapping
    public List<BranchDTO> listBranches(
            @PathVariable UUID conversationId,
            HttpServletRequest request) {
        getUserContext(request);
        return branchingService.listBranches(conversationId);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public BranchDTO createBranch(
            @PathVariable UUID conversationId,
            @Valid @RequestBody CreateBranchRequest createRequest,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return branchingService.createBranch(conversationId, createRequest, user.getUserId());
    }

    @GetMapping("/{branchId}")
    public BranchDTO getBranch(
            @PathVariable UUID conversationId,
            @PathVariable UUID branchId,
            HttpServletRequest request) {
        getUserContext(request);
        return branchingService.getBranch(branchId);
    }

    @PutMapping("/{branchId}/activate")
    public BranchDTO activateBranch(
            @PathVariable UUID conversationId,
            @PathVariable UUID branchId,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        return branchingService.activateBranch(conversationId, branchId, user.getUserId());
    }

    @DeleteMapping("/{branchId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteBranch(
            @PathVariable UUID conversationId,
            @PathVariable UUID branchId,
            HttpServletRequest request) {
        UserContext user = getUserContext(request);
        branchingService.deleteBranch(conversationId, branchId, user.getUserId());
    }

    @GetMapping("/compare")
    public BranchComparisonDTO compareBranches(
            @PathVariable UUID conversationId,
            @RequestParam UUID branchA,
            @RequestParam UUID branchB,
            HttpServletRequest request) {
        getUserContext(request);
        return branchingService.compareBranches(conversationId, branchA, branchB);
    }

    private UserContext getUserContext(HttpServletRequest request) {
        return (UserContext) request.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }
}
