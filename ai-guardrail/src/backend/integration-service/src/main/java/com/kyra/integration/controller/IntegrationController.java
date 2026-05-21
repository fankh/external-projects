package com.kyra.integration.controller;

import com.kyra.integration.dto.CreateIntegrationRequest;
import com.kyra.integration.dto.IntegrationDTO;
import com.kyra.integration.service.IntegrationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/integrations")
@RequiredArgsConstructor
@Slf4j
public class IntegrationController {

    private final IntegrationService integrationService;

    @GetMapping
    public ResponseEntity<Page<IntegrationDTO>> listIntegrations(
            @RequestParam UUID tenantId,
            @PageableDefault(size = 20) Pageable pageable) {
        log.info("List integrations for tenant {} page={}", tenantId, pageable.getPageNumber());
        Page<IntegrationDTO> integrations = integrationService.listIntegrations(tenantId, pageable);
        return ResponseEntity.ok(integrations);
    }

    @PostMapping
    public ResponseEntity<IntegrationDTO> createIntegration(
            @Valid @RequestBody CreateIntegrationRequest request) {
        log.info("Create integration type={} for tenant {}", request.getType(), request.getTenantId());
        IntegrationDTO created = integrationService.createIntegration(request);
        return ResponseEntity.ok(created);
    }

    @PutMapping("/{id}")
    public ResponseEntity<IntegrationDTO> updateIntegration(
            @PathVariable UUID id,
            @Valid @RequestBody CreateIntegrationRequest request) {
        log.info("Update integration {}", id);
        IntegrationDTO updated = integrationService.updateIntegration(id, request);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteIntegration(@PathVariable UUID id) {
        log.info("Delete integration {}", id);
        integrationService.deleteIntegration(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/test")
    public ResponseEntity<Map<String, Object>> testConnection(@PathVariable UUID id) {
        log.info("Test connection for integration {}", id);
        Map<String, Object> result = integrationService.testConnection(id);
        return ResponseEntity.ok(result);
    }
}
