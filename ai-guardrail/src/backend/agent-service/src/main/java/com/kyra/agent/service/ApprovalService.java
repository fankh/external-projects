package com.kyra.agent.service;

import com.kyra.agent.dto.ApproveRequest;
import com.kyra.agent.model.AgentApproval;
import com.kyra.agent.model.AgentExecution;
import com.kyra.agent.model.ExecutionStep;
import com.kyra.agent.repository.AgentApprovalRepository;
import com.kyra.agent.repository.AgentExecutionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ApprovalService {

    private final AgentApprovalRepository approvalRepository;
    private final AgentExecutionRepository executionRepository;

    /**
     * Create an approval request for a step that requires human review.
     */
    @Transactional
    public AgentApproval createApprovalRequest(AgentExecution execution,
                                                ExecutionStep step,
                                                String actionDescription,
                                                String riskLevel) {
        log.info("Creating approval request for execution={} step={} risk={}",
                execution.getId(), step.getId(), riskLevel);

        AgentApproval approval = AgentApproval.builder()
                .execution(execution)
                .step(step)
                .actionDescription(actionDescription)
                .riskLevel(riskLevel)
                .status(AgentApproval.ApprovalStatus.pending)
                .build();

        approval = approvalRepository.save(approval);

        // Update execution status to awaiting_approval
        execution.setStatus(AgentExecution.ExecutionStatus.awaiting_approval);
        executionRepository.save(execution);

        return approval;
    }

    /**
     * Process an approval or rejection decision.
     */
    @Transactional
    public AgentApproval processApproval(UUID approvalId, ApproveRequest request) {
        AgentApproval approval = approvalRepository.findById(approvalId)
                .orElseThrow(() -> new IllegalArgumentException("Approval not found: " + approvalId));

        if (approval.getStatus() != AgentApproval.ApprovalStatus.pending) {
            throw new IllegalStateException("Approval already processed: " + approval.getStatus());
        }

        approval.setStatus(request.getApproved()
                ? AgentApproval.ApprovalStatus.approved
                : AgentApproval.ApprovalStatus.rejected);
        approval.setReviewedBy(request.getReviewedBy());
        approval.setReviewNote(request.getReviewNote());
        approval.setReviewedAt(Instant.now());

        approval = approvalRepository.save(approval);

        log.info("Approval {} {} by user {}",
                approvalId, approval.getStatus(), request.getReviewedBy());

        return approval;
    }

    /**
     * Check if there are pending approvals for an execution.
     */
    public boolean hasPendingApprovals(UUID executionId) {
        List<AgentApproval> pending = approvalRepository
                .findByExecutionIdAndStatus(executionId, AgentApproval.ApprovalStatus.pending);
        return !pending.isEmpty();
    }

    /**
     * Get all pending approvals.
     */
    public List<AgentApproval> getPendingApprovals() {
        return approvalRepository.findByStatus(AgentApproval.ApprovalStatus.pending);
    }
}
