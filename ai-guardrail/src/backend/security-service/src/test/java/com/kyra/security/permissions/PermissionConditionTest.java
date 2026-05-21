package com.kyra.security.permissions;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;

/**
 * Tests for ABAC condition evaluation operators.
 */
class PermissionConditionTest {

    private PermissionEvaluator newEvaluator(List<PermissionGrant> grants) {
        PermissionGrantRepository repo = Mockito.mock(PermissionGrantRepository.class);
        Mockito.when(repo.findApplicable(any(), any(), any(), any())).thenReturn(grants);
        com.kyra.security.service.AuditService audit = Mockito.mock(com.kyra.security.service.AuditService.class);
        com.kyra.security.metrics.ComplianceMetrics metrics = Mockito.mock(com.kyra.security.metrics.ComplianceMetrics.class);
        return new PermissionEvaluator(repo, audit, metrics);
    }

    private PermissionGrant grant(Map<String, Object> conditions) {
        return PermissionGrant.builder()
                .id(UUID.randomUUID())
                .subjectType("GLOBAL").resourceType("*").action("*").effect("ALLOW")
                .conditions(conditions).build();
    }

    @Test
    void neOperator() {
        var e = newEvaluator(List.of(grant(Map.of("env", Map.of("$ne", "production")))));
        assertTrue(e.check(null, UUID.randomUUID(), "user", "deploy", null, "run",
                           Map.of("env", "staging")).allowed());
        assertFalse(e.check(null, UUID.randomUUID(), "user", "deploy", null, "run",
                            Map.of("env", "production")).allowed());
    }

    @Test
    void regexOperator() {
        var e = newEvaluator(List.of(grant(Map.of("email", Map.of("$regex", ".*@acme\\.com")))));
        assertTrue(e.check(null, UUID.randomUUID(), "user", "data", null, "read",
                           Map.of("email", "alice@acme.com")).allowed());
        assertFalse(e.check(null, UUID.randomUUID(), "user", "data", null, "read",
                            Map.of("email", "bob@evil.com")).allowed());
    }

    @Test
    void missingContextKeyDenies() {
        var e = newEvaluator(List.of(grant(Map.of("department", "engineering"))));
        assertFalse(e.check(null, UUID.randomUUID(), "user", "deploy", null, "run",
                            Map.of()).allowed());  // missing "department" key
    }

    @Test
    void nullConditionsAlwaysMatch() {
        var e = newEvaluator(List.of(grant(null)));
        assertTrue(e.check(null, UUID.randomUUID(), "user", "any", null, "any").allowed());
    }

    @Test
    void multipleConditionsAllMustPass() {
        var e = newEvaluator(List.of(grant(Map.of(
            "department", "engineering",
            "level", Map.of("$in", List.of("senior", "lead"))
        ))));
        assertTrue(e.check(null, UUID.randomUUID(), "user", "deploy", null, "run",
                           Map.of("department", "engineering", "level", "senior")).allowed());
        assertFalse(e.check(null, UUID.randomUUID(), "user", "deploy", null, "run",
                            Map.of("department", "engineering", "level", "junior")).allowed());
        assertFalse(e.check(null, UUID.randomUUID(), "user", "deploy", null, "run",
                            Map.of("department", "marketing", "level", "senior")).allowed());
    }
}
