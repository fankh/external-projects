package com.kyra.security.events;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/events")
@RequiredArgsConstructor
public class EventStoreController {

    private final EventStoreService store;

    @PostMapping
    public ResponseEntity<DomainEvent> append(
            @RequestHeader(value = "X-User-Role", required = false) String role,
            @RequestBody Map<String, Object> body) {
        String aggType = (String) body.getOrDefault("aggregateType", "unknown");
        String aggId = (String) body.getOrDefault("aggregateId", "");
        String eventType = (String) body.getOrDefault("eventType", "unknown");
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) body.getOrDefault("payload", Map.of());
        UUID tenantId = body.containsKey("tenantId") ? UUID.fromString((String) body.get("tenantId")) : null;
        UUID actorId = body.containsKey("actorId") ? UUID.fromString((String) body.get("actorId")) : null;
        return ResponseEntity.ok(store.append(aggType, aggId, eventType, payload, tenantId, actorId));
    }

    @GetMapping("/replay/{aggregateType}/{aggregateId}")
    public ResponseEntity<List<DomainEvent>> replay(
            @PathVariable String aggregateType, @PathVariable String aggregateId) {
        return ResponseEntity.ok(store.replay(aggregateType, aggregateId));
    }

    @GetMapping("/recent")
    public ResponseEntity<List<DomainEvent>> recent() {
        return ResponseEntity.ok(store.recent());
    }
}
