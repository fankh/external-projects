package com.kyra.memory.controller;

import com.kyra.memory.dto.ExtractMemoriesRequest;
import com.kyra.memory.dto.MemoryContextDTO;
import com.kyra.memory.dto.MemoryDTO;
import com.kyra.memory.service.MemoryService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/memory")
@RequiredArgsConstructor
@Slf4j
public class MemoryController {

    private final MemoryService memoryService;

    @GetMapping("/{userId}/context")
    public ResponseEntity<MemoryContextDTO> getContext(
            @PathVariable UUID userId,
            @RequestParam(required = false) UUID conversationId) {
        log.info("Get memory context for user={} conversation={}", userId, conversationId);
        MemoryContextDTO context = memoryService.getContext(userId, conversationId);
        return ResponseEntity.ok(context);
    }

    @PostMapping("/extract")
    public ResponseEntity<List<MemoryDTO>> extractMemories(
            @Valid @RequestBody ExtractMemoriesRequest request) {
        log.info("Extract memories for user={} conversation={}", request.getUserId(), request.getConversationId());
        List<MemoryDTO> extracted = memoryService.extractMemories(request);
        return ResponseEntity.ok(extracted);
    }

    @GetMapping("/{userId}")
    public ResponseEntity<Page<MemoryDTO>> listMemories(
            @PathVariable UUID userId,
            @RequestParam(required = false) String type,
            @PageableDefault(size = 20) Pageable pageable) {
        log.info("List memories for user={} type={}", userId, type);
        Page<MemoryDTO> memories = memoryService.listMemories(userId, type, pageable);
        return ResponseEntity.ok(memories);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteMemory(@PathVariable UUID id) {
        log.info("Delete memory id={}", id);
        memoryService.deleteMemory(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{userId}/consolidate")
    public ResponseEntity<Map<String, Object>> consolidate(@PathVariable UUID userId) {
        log.info("Consolidate memories for user={}", userId);
        Map<String, Object> result = memoryService.consolidate(userId);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{userId}/stats")
    public ResponseEntity<Map<String, Object>> getStats(@PathVariable UUID userId) {
        log.info("Get memory stats for user={}", userId);
        Map<String, Object> stats = memoryService.getStats(userId);
        return ResponseEntity.ok(stats);
    }
}
