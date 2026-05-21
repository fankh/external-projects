package com.kyra.workflow.engine;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/workflow-engine")
@RequiredArgsConstructor
public class WorkflowEngineController {

    private final WorkflowDefinitionRepository defRepo;
    private final WorkflowRunRepository runRepo;
    private final WorkflowExecutor engine;

    @GetMapping
    public ResponseEntity<List<WorkflowDefinition>> list() {
        return ResponseEntity.ok(defRepo.findAll());
    }

    @PostMapping
    public ResponseEntity<WorkflowDefinition> create(@RequestBody WorkflowDefinition in) {
        return ResponseEntity.ok(defRepo.save(in));
    }

    @GetMapping("/{id}")
    public ResponseEntity<WorkflowDefinition> get(@PathVariable UUID id) {
        return defRepo.findById(id).map(ResponseEntity::ok).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/run")
    public ResponseEntity<WorkflowRun> run(@PathVariable UUID id, @RequestBody(required = false) Map<String, Object> input) {
        return ResponseEntity.ok(engine.execute(id, input != null ? input : Map.of()));
    }

    @GetMapping("/{id}/runs")
    public ResponseEntity<List<WorkflowRun>> runs(@PathVariable UUID id) {
        return ResponseEntity.ok(runRepo.findByWorkflowIdOrderByCreatedAtDesc(id));
    }

    @GetMapping("/runs/recent")
    public ResponseEntity<List<WorkflowRun>> recentRuns() {
        return ResponseEntity.ok(runRepo.findTop50ByOrderByCreatedAtDesc());
    }
}
