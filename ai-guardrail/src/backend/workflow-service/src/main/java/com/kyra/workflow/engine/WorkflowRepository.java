package com.kyra.workflow.engine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.UUID;

@Repository interface WorkflowDefinitionRepository extends JpaRepository<WorkflowDefinition, UUID> {
    List<WorkflowDefinition> findByIsActiveTrue();
}
@Repository interface WorkflowRunRepository extends JpaRepository<WorkflowRun, UUID> {
    List<WorkflowRun> findByWorkflowIdOrderByCreatedAtDesc(UUID workflowId);
    List<WorkflowRun> findTop50ByOrderByCreatedAtDesc();
}
