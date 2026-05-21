package com.kyra.security.permissions;

import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;

class PermissionEvaluatorTest {

    private PermissionEvaluator newEvaluator(List<PermissionGrant> grants) {
        PermissionGrantRepository repo = Mockito.mock(PermissionGrantRepository.class);
        Mockito.when(repo.findApplicable(any(), any(), any(), any())).thenReturn(grants);
        com.kyra.security.service.AuditService audit = Mockito.mock(com.kyra.security.service.AuditService.class);
        com.kyra.security.metrics.ComplianceMetrics metrics = Mockito.mock(com.kyra.security.metrics.ComplianceMetrics.class);
        PermissionEvaluator e = new PermissionEvaluator(repo, audit, metrics);
        return e;
    }

    private PermissionGrant grant(String subjType, String subjId, String resType, String resId,
                                   String action, String effect, Map<String,Object> conditions) {
        return PermissionGrant.builder()
                .id(UUID.randomUUID())
                .subjectType(subjType).subjectId(subjId)
                .resourceType(resType).resourceId(resId)
                .action(action).effect(effect).conditions(conditions)
                .build();
    }

    @Test
    void defaultDenyWhenNoGrants() {
        var e = newEvaluator(List.of());
        var d = e.check(null, UUID.randomUUID(), "user", "privacy", null, "read");
        assertFalse(d.allowed());
        assertTrue(d.reason().contains("default deny"));
    }

    @Test
    void wildcardRoleAdminAllowsAll() {
        var e = newEvaluator(List.of(
            grant("ROLE", "admin", "*", null, "*", "ALLOW", null)
        ));
        var d = e.check(null, UUID.randomUUID(), "admin", "audit", "some-id", "verify");
        assertTrue(d.allowed());
        assertTrue(d.reason().contains("ROLE:admin"));
    }

    @Test
    void denyOverridesAllow() {
        UUID userId = UUID.randomUUID();
        var e = newEvaluator(List.of(
            grant("ROLE", "admin", "*", null, "*", "ALLOW", null),
            grant("USER", userId.toString(), "audit", null, "verify", "DENY", null)
        ));
        var d = e.check(null, userId, "admin", "audit", null, "verify");
        assertFalse(d.allowed());
        assertTrue(d.reason().contains("DENY"));
    }

    @Test
    void abacConditionMatch() {
        var e = newEvaluator(List.of(
            grant("ROLE", "engineer", "deploy", null, "trigger", "ALLOW",
                  Map.of("environment", "staging"))
        ));
        var allowed = e.check(null, UUID.randomUUID(), "engineer", "deploy", null, "trigger",
                              Map.of("environment", "staging"));
        assertTrue(allowed.allowed());

        var denied = e.check(null, UUID.randomUUID(), "engineer", "deploy", null, "trigger",
                             Map.of("environment", "production"));
        assertFalse(denied.allowed());
    }

    @Test
    void abacInOperator() {
        var e = newEvaluator(List.of(
            grant("GLOBAL", null, "region", null, "read", "ALLOW",
                  Map.of("region", Map.of("$in", List.of("us", "eu"))))
        ));
        var allowed = e.check(null, UUID.randomUUID(), "user", "region", null, "read",
                              Map.of("region", "us"));
        assertTrue(allowed.allowed());
        var denied = e.check(null, UUID.randomUUID(), "user", "region", null, "read",
                             Map.of("region", "asia"));
        assertFalse(denied.allowed());
    }

    @Test
    void exactResourceBeatsWildcard() {
        var e = newEvaluator(List.of(
            grant("ROLE", "user", "document", null, "read", "ALLOW", null),
            grant("ROLE", "user", "document", "secret-doc", "read", "DENY", null)
        ));
        var d = e.check(null, UUID.randomUUID(), "user", "document", "secret-doc", "read");
        assertFalse(d.allowed());  // DENY wins
    }
}
