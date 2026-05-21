package com.kyra.agent.repository;

import com.kyra.agent.model.AgentExecution;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AgentExecutionRepository extends JpaRepository<AgentExecution, UUID> {

    Page<AgentExecution> findByUserId(UUID userId, Pageable pageable);

    Page<AgentExecution> findByUserIdAndStatus(UUID userId, AgentExecution.ExecutionStatus status, Pageable pageable);

    List<AgentExecution> findByStatus(AgentExecution.ExecutionStatus status);

    List<AgentExecution> findByAgentIdAndUserId(UUID agentId, UUID userId);
}
