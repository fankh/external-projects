package com.kyra.branching.service;

import com.kyra.branching.dto.BranchComparisonDTO;
import com.kyra.branching.dto.BranchDTO;
import com.kyra.branching.dto.CreateBranchRequest;
import com.kyra.branching.model.ConversationBranch;
import com.kyra.branching.repository.ConversationBranchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class BranchingService {

    private final ConversationBranchRepository branchRepository;

    public List<BranchDTO> listBranches(UUID conversationId) {
        return branchRepository.findByConversationIdOrderByCreatedAtAsc(conversationId)
                .stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
    }

    @Transactional
    public BranchDTO createBranch(UUID conversationId, CreateBranchRequest request, String userId) {
        ConversationBranch branch = ConversationBranch.builder()
                .conversationId(conversationId)
                .parentMessageId(request.getParentMessageId())
                .branchName(request.getBranchName())
                .description(request.getDescription())
                .isActive(false)
                .createdBy(UUID.fromString(userId))
                .messageCount(0)
                .build();

        branch = branchRepository.save(branch);
        log.info("Created branch {} for conversation {} by user {}", branch.getId(), conversationId, userId);
        return toDTO(branch);
    }

    public BranchDTO getBranch(UUID branchId) {
        ConversationBranch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new RuntimeException("Branch not found: " + branchId));
        return toDTO(branch);
    }

    @Transactional
    public BranchDTO activateBranch(UUID conversationId, UUID branchId, String userId) {
        ConversationBranch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new RuntimeException("Branch not found: " + branchId));

        if (!branch.getConversationId().equals(conversationId)) {
            throw new RuntimeException("Branch does not belong to conversation: " + conversationId);
        }

        // Deactivate all branches for this conversation
        branchRepository.deactivateAllBranches(conversationId);

        // Activate the selected branch
        branch.setIsActive(true);
        branch = branchRepository.save(branch);

        log.info("Activated branch {} for conversation {} by user {}", branchId, conversationId, userId);
        return toDTO(branch);
    }

    @Transactional
    public void deleteBranch(UUID conversationId, UUID branchId, String userId) {
        ConversationBranch branch = branchRepository.findById(branchId)
                .orElseThrow(() -> new RuntimeException("Branch not found: " + branchId));

        if (!branch.getConversationId().equals(conversationId)) {
            throw new RuntimeException("Branch does not belong to conversation: " + conversationId);
        }

        if (!branch.getCreatedBy().toString().equals(userId)) {
            throw new RuntimeException("Access denied to branch: " + branchId);
        }

        branchRepository.delete(branch);
        log.info("Deleted branch {} for conversation {} by user {}", branchId, conversationId, userId);
    }

    public BranchComparisonDTO compareBranches(UUID conversationId, UUID branchAId, UUID branchBId) {
        ConversationBranch branchA = branchRepository.findById(branchAId)
                .orElseThrow(() -> new RuntimeException("Branch not found: " + branchAId));
        ConversationBranch branchB = branchRepository.findById(branchBId)
                .orElseThrow(() -> new RuntimeException("Branch not found: " + branchBId));

        if (!branchA.getConversationId().equals(conversationId) || !branchB.getConversationId().equals(conversationId)) {
            throw new RuntimeException("One or both branches do not belong to conversation: " + conversationId);
        }

        // Determine common parent - use the one that is the same or the earlier one
        UUID commonParent = branchA.getParentMessageId().equals(branchB.getParentMessageId())
                ? branchA.getParentMessageId()
                : branchA.getParentMessageId();

        return BranchComparisonDTO.builder()
                .branchA(toBranchSummary(branchA))
                .branchB(toBranchSummary(branchB))
                .commonParentMessageId(commonParent)
                .build();
    }

    private BranchDTO toDTO(ConversationBranch branch) {
        return BranchDTO.builder()
                .id(branch.getId())
                .conversationId(branch.getConversationId())
                .parentMessageId(branch.getParentMessageId())
                .branchName(branch.getBranchName())
                .description(branch.getDescription())
                .isActive(branch.getIsActive())
                .createdBy(branch.getCreatedBy())
                .firstMessageId(branch.getFirstMessageId())
                .messageCount(branch.getMessageCount())
                .createdAt(branch.getCreatedAt())
                .build();
    }

    private BranchComparisonDTO.BranchSummary toBranchSummary(ConversationBranch branch) {
        return BranchComparisonDTO.BranchSummary.builder()
                .id(branch.getId())
                .branchName(branch.getBranchName())
                .description(branch.getDescription())
                .isActive(branch.getIsActive())
                .messageCount(branch.getMessageCount())
                .createdAt(branch.getCreatedAt())
                .build();
    }
}
