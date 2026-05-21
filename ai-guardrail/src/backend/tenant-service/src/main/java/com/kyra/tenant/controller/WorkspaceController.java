package com.kyra.tenant.controller;

import com.kyra.tenant.model.Workspace;
import com.kyra.tenant.model.Team;
import lombok.RequiredArgsConstructor;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Repository;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@Repository interface WorkspaceRepository extends JpaRepository<Workspace, UUID> {
    List<Workspace> findByTenantId(UUID tenantId);
}
@Repository interface TeamRepository extends JpaRepository<Team, UUID> {
    List<Team> findByWorkspaceId(UUID workspaceId);
}

@RestController
@RequestMapping("/v1/workspaces")
@RequiredArgsConstructor
class WorkspaceController {

    private final WorkspaceRepository workspaceRepo;
    private final TeamRepository teamRepo;

    @GetMapping("/{tenantId}")
    public ResponseEntity<List<Workspace>> listWorkspaces(@PathVariable UUID tenantId) {
        return ResponseEntity.ok(workspaceRepo.findByTenantId(tenantId));
    }

    @PostMapping
    public ResponseEntity<Workspace> createWorkspace(@RequestBody Workspace in) {
        return ResponseEntity.ok(workspaceRepo.save(in));
    }

    @GetMapping("/{workspaceId}/teams")
    public ResponseEntity<List<Team>> listTeams(@PathVariable UUID workspaceId) {
        return ResponseEntity.ok(teamRepo.findByWorkspaceId(workspaceId));
    }

    @PostMapping("/teams")
    public ResponseEntity<Team> createTeam(@RequestBody Team in) {
        return ResponseEntity.ok(teamRepo.save(in));
    }
}
