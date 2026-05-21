package com.kyra.security.permissions;

import com.kyra.security.service.AuditService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Evaluates (subject, action, resource) against all matching grants.
 *
 * Decision rules (first match wins by specificity):
 *   1. Any explicit DENY that matches wins (deny-overrides).
 *   2. USER grants beat ROLE grants beat TENANT grants beat GLOBAL.
 *   3. Exact resource_id beats wildcard (NULL resource_id).
 *   4. Exact action beats wildcard ('*' action).
 *   5. No match → DENY (default deny).
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PermissionEvaluator {

    private final PermissionGrantRepository repo;
    private final AuditService auditService;
    private final com.kyra.security.metrics.ComplianceMetrics metrics;

    public record Decision(boolean allowed, String reason, UUID matchedGrantId) {}

    public Decision check(UUID tenantId, UUID userId, String role,
                          String resourceType, String resourceId, String action) {
        return check(tenantId, userId, role, resourceType, resourceId, action, java.util.Map.of());
    }

    public Decision check(UUID tenantId, UUID userId, String role,
                          String resourceType, String resourceId, String action,
                          java.util.Map<String, Object> context) {
        return com.kyra.security.tracing.TraceHelper.span("permission.check",
            java.util.Map.of("resource_type", resourceType, "action", action,
                             "role", role == null ? "" : role),
            () -> checkInternal(tenantId, userId, role, resourceType, resourceId, action, context));
    }

    private Decision checkInternal(UUID tenantId, UUID userId, String role,
                                    String resourceType, String resourceId, String action,
                                    java.util.Map<String, Object> context) {
        String userIdStr = userId == null ? null : userId.toString();
        String tenantIdStr = tenantId == null ? null : tenantId.toString();
        String effectiveRole = role == null ? "user" : role;

        List<PermissionGrant> candidates = repo.findApplicable(userIdStr, effectiveRole, tenantIdStr, tenantId);

        // Filter to grants matching resource+action
        List<PermissionGrant> matching = new ArrayList<>();
        for (PermissionGrant g : candidates) {
            if (!matchesResourceType(g.getResourceType(), resourceType)) continue;
            if (!matchesResourceId(g.getResourceId(), resourceId)) continue;
            if (!matchesAction(g.getAction(), action)) continue;
            if (!evaluateConditions(g.getConditions(), context)) continue;
            matching.add(g);
        }

        if (matching.isEmpty()) {
            return new Decision(false, "no matching grant (default deny)", null);
        }

        // Deny-overrides
        for (PermissionGrant g : matching) {
            if ("DENY".equals(g.getEffect())) {
                return new Decision(false, "explicit DENY via " + describe(g), g.getId());
            }
        }

        // Pick the most specific ALLOW (used purely for the reason string)
        PermissionGrant best = matching.stream().max(Comparator.comparingInt(this::specificityScore)).orElseThrow();
        return new Decision(true, "ALLOW via " + describe(best), best.getId());
    }

    /** Convenience: log the check result to audit_logs (sensitive ones only; keep audit volume reasonable). */
    public Decision checkAndAudit(UUID tenantId, UUID userId, String role,
                                  String resourceType, String resourceId, String action) {
        return checkAndAudit(tenantId, userId, role, resourceType, resourceId, action, java.util.Map.of());
    }

    public Decision checkAndAudit(UUID tenantId, UUID userId, String role,
                                  String resourceType, String resourceId, String action,
                                  java.util.Map<String, Object> context) {
        Decision d = check(tenantId, userId, role, resourceType, resourceId, action, context);
        metrics.permissionDecision(resourceType, action, d.allowed());
        if (!d.allowed() || isSensitiveAction(action)) {
            auditService.logAuditEvent(tenantId, userId,
                    "permission.check." + (d.allowed() ? "allowed" : "denied"),
                    resourceType, resourceId,
                    Map.of("action", action, "reason", d.reason(),
                           "grantId", d.matchedGrantId() == null ? "" : d.matchedGrantId().toString()),
                    d.allowed() ? "SUCCESS" : "FAILURE", null, null);
        }
        return d;
    }

    private boolean matchesResourceType(String grantType, String requested) {
        return "*".equals(grantType) || grantType.equals(requested);
    }
    private boolean matchesResourceId(String grantResId, String requested) {
        return grantResId == null || grantResId.equals(requested);
    }
    private boolean matchesAction(String grantAction, String requested) {
        return "*".equals(grantAction) || grantAction.equals(requested);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private boolean evaluateConditions(java.util.Map<String, Object> conditions, java.util.Map<String, Object> ctx) {
        if (conditions == null || conditions.isEmpty()) return true;
        for (java.util.Map.Entry<String, Object> e : conditions.entrySet()) {
            Object ctxVal = ctx == null ? null : ctx.get(e.getKey());
            Object req = e.getValue();
            if (req instanceof java.util.Map m) {
                for (Object opObj : m.entrySet()) {
                    java.util.Map.Entry<String, Object> op = (java.util.Map.Entry<String, Object>) opObj;
                    switch (op.getKey()) {
                        case "$eq":
                            if (!java.util.Objects.equals(ctxVal, op.getValue())) return false;
                            break;
                        case "$ne":
                            if (java.util.Objects.equals(ctxVal, op.getValue())) return false;
                            break;
                        case "$in":
                            if (!(op.getValue() instanceof java.util.List list) || !list.contains(ctxVal)) return false;
                            break;
                        case "$regex":
                            if (ctxVal == null) return false;
                            if (!ctxVal.toString().matches(op.getValue().toString())) return false;
                            break;
                        default:
                            log.warn("unknown condition op: {}", op.getKey());
                            return false;
                    }
                }
            } else {
                // plain equality
                if (!java.util.Objects.equals(ctxVal, req)) return false;
            }
        }
        return true;
    }

    private int specificityScore(PermissionGrant g) {
        int s = 0;
        switch (g.getSubjectType()) {
            case "USER" -> s += 400;
            case "ROLE" -> s += 300;
            case "TENANT" -> s += 200;
            case "GLOBAL" -> s += 100;
        }
        if (g.getResourceId() != null) s += 50;
        if (!"*".equals(g.getAction())) s += 20;
        if (!"*".equals(g.getResourceType())) s += 10;
        return s;
    }

    private boolean isSensitiveAction(String action) {
        return action != null && (action.equals("delete") || action.equals("fulfill") ||
                                   action.equals("write") || action.equals("export") ||
                                   action.equals("admin") || action.equals("legal-hold"));
    }

    private String describe(PermissionGrant g) {
        return String.format("%s:%s → %s:%s/%s",
                g.getSubjectType(), g.getSubjectId() == null ? "*" : g.getSubjectId(),
                g.getResourceType(),
                g.getResourceId() == null ? "*" : g.getResourceId(),
                g.getAction());
    }
}
