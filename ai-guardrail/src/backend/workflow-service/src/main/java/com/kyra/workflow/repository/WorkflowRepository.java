package com.kyra.workflow.repository;

import com.kyra.workflow.model.Workflow;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface WorkflowRepository extends JpaRepository<Workflow, UUID> {

    List<Workflow> findByPurposeId(String purposeId);

    List<Workflow> findByStatus(Workflow.WorkflowStatus status);

    List<Workflow> findByPurposeIdAndStatus(String purposeId, Workflow.WorkflowStatus status);
}
