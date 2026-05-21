package com.kyra.workflow.repository;

import com.kyra.workflow.model.WorkflowExecution;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface WorkflowExecutionRepository extends JpaRepository<WorkflowExecution, UUID> {

    List<WorkflowExecution> findByUserIdOrderByCreatedAtDesc(UUID userId);

    List<WorkflowExecution> findByWorkflowIdOrderByCreatedAtDesc(UUID workflowId);

    List<WorkflowExecution> findByUserIdAndStatus(UUID userId, WorkflowExecution.ExecutionStatus status);
}
