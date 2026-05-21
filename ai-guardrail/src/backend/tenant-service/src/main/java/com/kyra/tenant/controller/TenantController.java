package com.kyra.tenant.controller;

import com.kyra.tenant.dto.*;
import com.kyra.tenant.service.TenantContextService;
import com.kyra.tenant.service.TenantService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/tenants")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;
    private final TenantContextService tenantContextService;

    @PostMapping
    public ResponseEntity<TenantDTO> createTenant(@Valid @RequestBody CreateTenantRequest request) {
        TenantDTO tenant = tenantService.createTenant(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(tenant);
    }

    @GetMapping("/{id}")
    public ResponseEntity<TenantDTO> getTenant(@PathVariable UUID id) {
        TenantDTO tenant = tenantService.getTenant(id);
        return ResponseEntity.ok(tenant);
    }

    @GetMapping("/by-slug/{slug}")
    public ResponseEntity<TenantDTO> getTenantBySlug(@PathVariable String slug) {
        TenantDTO tenant = tenantService.getTenantBySlug(slug);
        return ResponseEntity.ok(tenant);
    }

    @PatchMapping("/{id}")
    public ResponseEntity<TenantDTO> updateTenant(
            @PathVariable UUID id,
            @RequestBody UpdateTenantRequest request) {
        TenantDTO tenant = tenantService.updateTenant(id, request);
        return ResponseEntity.ok(tenant);
    }

    @PostMapping("/{id}/suspend")
    public ResponseEntity<TenantDTO> suspendTenant(@PathVariable UUID id) {
        TenantDTO tenant = tenantService.suspendTenant(id);
        return ResponseEntity.ok(tenant);
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<TenantDTO> activateTenant(@PathVariable UUID id) {
        TenantDTO tenant = tenantService.activateTenant(id);
        return ResponseEntity.ok(tenant);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, String>> deactivateTenant(@PathVariable UUID id) {
        tenantService.deactivateTenant(id);
        return ResponseEntity.ok(Map.of("message", "Tenant deactivated successfully"));
    }

    @GetMapping
    public ResponseEntity<List<TenantDTO>> listTenants(
            @RequestHeader(value = "X-User-Role", required = false) String role) {
        if (!"ADMIN".equalsIgnoreCase(role)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).build();
        }
        List<TenantDTO> tenants = tenantService.listTenants();
        return ResponseEntity.ok(tenants);
    }

    // Internal endpoint for gateway to resolve tenant context
    @GetMapping("/context/{id}")
    public ResponseEntity<TenantContextDTO> getTenantContext(@PathVariable UUID id) {
        TenantContextDTO context = tenantContextService.resolveById(id);
        return ResponseEntity.ok(context);
    }

    @GetMapping("/context/by-slug/{slug}")
    public ResponseEntity<TenantContextDTO> getTenantContextBySlug(@PathVariable String slug) {
        TenantContextDTO context = tenantContextService.resolveBySlug(slug);
        return ResponseEntity.ok(context);
    }

    // Exception handlers
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException e) {
        return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(java.util.NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(java.util.NoSuchElementException e) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleConflict(IllegalStateException e) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(TenantContextService.TenantSuspendedException.class)
    public ResponseEntity<Map<String, String>> handleSuspended(TenantContextService.TenantSuspendedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
    }

    @ExceptionHandler(TenantContextService.TenantCancelledException.class)
    public ResponseEntity<Map<String, String>> handleCancelled(TenantContextService.TenantCancelledException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", e.getMessage()));
    }

    @GetMapping("/{id}/export")
    public ResponseEntity<byte[]> downloadExport(@PathVariable UUID id) throws java.io.IOException {
        java.io.File f = new java.io.File("/tmp/tenant-exports/" + id + ".json");
        if (!f.exists()) {
            return ResponseEntity.notFound().build();
        }
        byte[] bytes = java.nio.file.Files.readAllBytes(f.toPath());
        return ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=tenant-" + id + ".json")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(bytes);
    }
}
