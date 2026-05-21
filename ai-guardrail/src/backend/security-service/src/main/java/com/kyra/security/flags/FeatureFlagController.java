package com.kyra.security.flags;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/flags")
@RequiredArgsConstructor
public class FeatureFlagController {
    private final FeatureFlagRepository repo;
    private final FeatureFlagService service;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    @GetMapping
    public ResponseEntity<List<FeatureFlag>> list(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.findAll());
    }

    @PostMapping
    public ResponseEntity<FeatureFlag> create(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody FeatureFlag in) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.save(in));
    }

    @PutMapping("/{id}")
    public ResponseEntity<FeatureFlag> update(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID id, @RequestBody FeatureFlag in) {
        requireAdmin(role);
        FeatureFlag existing = repo.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (in.getEnabled() != null) existing.setEnabled(in.getEnabled());
        if (in.getDescription() != null) existing.setDescription(in.getDescription());
        if (in.getPercentage() != null) existing.setPercentage(in.getPercentage());
        if (in.getTenantOverrides() != null) existing.setTenantOverrides(in.getTenantOverrides());
        return ResponseEntity.ok(repo.save(existing));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID id) {
        requireAdmin(role);
        repo.deleteById(id);
        return ResponseEntity.ok(Map.of("deleted", id.toString()));
    }

    @GetMapping("/evaluate")
    public ResponseEntity<Map<String, Object>> evaluate(
            @RequestParam String key,
            @RequestParam(required = false) UUID tenantId) {
        boolean on = service.isEnabled(key, tenantId);
        return ResponseEntity.ok(Map.of("key", key, "enabled", on, "tenantId", tenantId == null ? "" : tenantId.toString()));
    }
}
