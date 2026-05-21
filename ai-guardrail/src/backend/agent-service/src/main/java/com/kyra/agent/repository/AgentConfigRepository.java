package com.kyra.agent.repository;

import com.kyra.agent.model.AgentConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AgentConfigRepository extends JpaRepository<AgentConfig, UUID> {

    List<AgentConfig> findByIsActiveTrue();

    List<AgentConfig> findByAgentType(AgentConfig.AgentType agentType);
}
