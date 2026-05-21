package com.kyra.agent.repository;

import com.kyra.agent.model.AgentApproval;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AgentApprovalRepository extends JpaRepository<AgentApproval, UUID> {

    List<AgentApproval> findByExecutionId(UUID executionId);

    List<AgentApproval> findByStatus(AgentApproval.ApprovalStatus status);

    List<AgentApproval> findByExecutionIdAndStatus(UUID executionId, AgentApproval.ApprovalStatus status);
}
