package com.kyra.security.dlp;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/dlp/whitelist")
@RequiredArgsConstructor
public class DlpWhitelistController {

    private final DlpWhitelistRepository repo;

    private void requireAdmin(String role) {
        if (!"admin".equalsIgnoreCase(role)) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
    }

    @GetMapping
    public ResponseEntity<List<DlpWhitelistRule>> list(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.findAll());
    }

    @PostMapping
    public ResponseEntity<DlpWhitelistRule> create(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody DlpWhitelistRule in) {
        requireAdmin(role);
        return ResponseEntity.ok(repo.save(in));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> delete(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @PathVariable UUID id) {
        requireAdmin(role);
        repo.deleteById(id);
        return ResponseEntity.ok(Map.of("deleted", id.toString()));
    }

    /**
     * Evaluate whether a DLP violation should be suppressed given the request context.
     * Context is a map like {"user_role": "admin", "department": "legal"}.
     */
    @PostMapping("/evaluate")
    public ResponseEntity<Map<String, Object>> evaluate(@RequestBody Map<String, String> context) {
        List<DlpWhitelistRule> rules = repo.findByIsActiveTrue();
        for (DlpWhitelistRule r : rules) {
            String ctxVal = context.get(r.getContextField());
            if (ctxVal != null && ctxVal.equalsIgnoreCase(r.getContextValue())) {
                return ResponseEntity.ok(Map.of(
                    "whitelisted", true,
                    "effect", r.getEffect(),
                    "rule_id", r.getId().toString(),
                    "matched_field", r.getContextField(),
                    "matched_value", r.getContextValue(),
                    "description", r.getDescription() == null ? "" : r.getDescription()
                ));
            }
        }
        return ResponseEntity.ok(Map.of("whitelisted", false));
    }
}
