package com.kyra.integration.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.*;

/**
 * SCIM 2.0 User Provisioning Service.
 * Implements create, update, delete, list, and bulk operations
 * per RFC 7643 / RFC 7644.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ScimService {

    // In-memory store for SCIM users (production would back to a real user store)
    private final Map<String, Map<String, Object>> scimUsers = new LinkedHashMap<>();

    private static final List<String> SCIM_SCHEMAS = List.of("urn:ietf:params:scim:schemas:core:2.0:User");
    private static final String LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";

    /**
     * List all SCIM users with optional filtering.
     */
    public Map<String, Object> listUsers(String filter, int startIndex, int count) {
        List<Map<String, Object>> users = new ArrayList<>(scimUsers.values());

        // Apply basic filter (displayName eq "value" or userName eq "value")
        if (filter != null && !filter.isBlank()) {
            users = users.stream()
                    .filter(u -> matchesFilter(u, filter))
                    .toList();
        }

        int total = users.size();
        int start = Math.max(0, startIndex - 1);
        int end = Math.min(total, start + count);
        List<Map<String, Object>> page = users.subList(start, end);

        return Map.of(
                "schemas", List.of(LIST_SCHEMA),
                "totalResults", total,
                "startIndex", startIndex,
                "itemsPerPage", page.size(),
                "Resources", page
        );
    }

    /**
     * Create a new SCIM user.
     */
    public Map<String, Object> createUser(Map<String, Object> userData) {
        String id = UUID.randomUUID().toString();
        String now = Instant.now().toString();

        Map<String, Object> user = new LinkedHashMap<>();
        user.put("schemas", SCIM_SCHEMAS);
        user.put("id", id);
        user.putAll(userData);
        user.put("active", true);
        user.put("meta", Map.of(
                "resourceType", "User",
                "created", now,
                "lastModified", now,
                "location", "/scim/v2/Users/" + id
        ));

        scimUsers.put(id, user);
        log.info("SCIM user created: id={} userName={}", id, userData.get("userName"));
        return user;
    }

    /**
     * Get a SCIM user by ID.
     */
    public Map<String, Object> getUser(String id) {
        Map<String, Object> user = scimUsers.get(id);
        if (user == null) {
            throw new NoSuchElementException("SCIM user not found: " + id);
        }
        return user;
    }

    /**
     * Patch (update) a SCIM user. Supports "replace" and "add" operations.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> patchUser(String id, Map<String, Object> patchRequest) {
        Map<String, Object> user = scimUsers.get(id);
        if (user == null) {
            throw new NoSuchElementException("SCIM user not found: " + id);
        }

        List<Map<String, Object>> operations =
                (List<Map<String, Object>>) patchRequest.get("Operations");

        if (operations != null) {
            for (Map<String, Object> op : operations) {
                String opType = (String) op.get("op");
                String path = (String) op.get("path");
                Object value = op.get("value");

                switch (opType.toLowerCase()) {
                    case "replace" -> {
                        if (path != null) {
                            user.put(path, value);
                        } else if (value instanceof Map) {
                            user.putAll((Map<String, Object>) value);
                        }
                    }
                    case "add" -> {
                        if (path != null) {
                            user.put(path, value);
                        }
                    }
                    case "remove" -> {
                        if (path != null) {
                            user.remove(path);
                        }
                    }
                }
            }
        }

        // Update meta.lastModified
        Map<String, Object> meta = new LinkedHashMap<>((Map<String, Object>) user.getOrDefault("meta", Map.of()));
        meta.put("lastModified", Instant.now().toString());
        user.put("meta", meta);

        scimUsers.put(id, user);
        log.info("SCIM user patched: id={}", id);
        return user;
    }

    /**
     * Deactivate (soft-delete) a SCIM user.
     */
    public void deleteUser(String id) {
        Map<String, Object> user = scimUsers.get(id);
        if (user == null) {
            throw new NoSuchElementException("SCIM user not found: " + id);
        }
        user.put("active", false);
        scimUsers.put(id, user);
        log.info("SCIM user deactivated: id={}", id);
    }

    /**
     * Bulk operation support.
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> bulkOperation(Map<String, Object> bulkRequest) {
        List<Map<String, Object>> operations =
                (List<Map<String, Object>>) bulkRequest.get("Operations");
        List<Map<String, Object>> results = new ArrayList<>();

        if (operations != null) {
            for (Map<String, Object> op : operations) {
                String method = (String) op.get("method");
                String path = (String) op.get("path");
                Map<String, Object> data = (Map<String, Object>) op.get("data");

                try {
                    Map<String, Object> result = switch (method.toUpperCase()) {
                        case "POST" -> {
                            Map<String, Object> created = createUser(data);
                            yield Map.of("method", method, "status", "201",
                                    "location", "/scim/v2/Users/" + created.get("id"));
                        }
                        case "PATCH" -> {
                            String userId = extractIdFromPath(path);
                            patchUser(userId, data);
                            yield Map.of("method", method, "status", "200",
                                    "location", path);
                        }
                        case "DELETE" -> {
                            String userId = extractIdFromPath(path);
                            deleteUser(userId);
                            yield Map.of("method", method, "status", "204",
                                    "location", path);
                        }
                        default -> Map.of("method", method, "status", "400",
                                "response", Map.of("detail", "Unsupported method"));
                    };
                    results.add(result);
                } catch (Exception e) {
                    results.add(Map.of("method", method, "status", "400",
                            "response", Map.of("detail", e.getMessage())));
                }
            }
        }

        return Map.of(
                "schemas", List.of("urn:ietf:params:scim:api:messages:2.0:BulkResponse"),
                "Operations", results
        );
    }

    private boolean matchesFilter(Map<String, Object> user, String filter) {
        // Basic support for "attribute eq value" filters
        String[] parts = filter.split("\\s+eq\\s+", 2);
        if (parts.length == 2) {
            String attr = parts[0].trim();
            String value = parts[1].trim().replace("\"", "");
            Object userValue = user.get(attr);
            return userValue != null && userValue.toString().equalsIgnoreCase(value);
        }
        return true;
    }

    private String extractIdFromPath(String path) {
        if (path == null) return "";
        String[] segments = path.split("/");
        return segments[segments.length - 1];
    }
}
