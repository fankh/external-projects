package com.kyra.integration.controller;

import com.kyra.integration.service.ScimService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/scim/v2")
@RequiredArgsConstructor
@Slf4j
public class ScimController {

    private final ScimService scimService;

    private static final String SCIM_CONTENT_TYPE = "application/scim+json";

    @GetMapping(value = "/Users", produces = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> listUsers(
            @RequestParam(required = false) String filter,
            @RequestParam(defaultValue = "1") int startIndex,
            @RequestParam(defaultValue = "100") int count) {
        log.info("SCIM list users: filter={} startIndex={} count={}", filter, startIndex, count);
        Map<String, Object> result = scimService.listUsers(filter, startIndex, count);
        return ResponseEntity.ok(result);
    }

    @PostMapping(value = "/Users",
            consumes = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE},
            produces = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> createUser(
            @RequestBody Map<String, Object> userData) {
        log.info("SCIM create user: userName={}", userData.get("userName"));
        Map<String, Object> created = scimService.createUser(userData);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping(value = "/Users/{id}", produces = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> getUser(@PathVariable String id) {
        log.info("SCIM get user: id={}", id);
        Map<String, Object> user = scimService.getUser(id);
        return ResponseEntity.ok(user);
    }

    @PatchMapping(value = "/Users/{id}",
            consumes = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE},
            produces = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> patchUser(
            @PathVariable String id,
            @RequestBody Map<String, Object> patchRequest) {
        log.info("SCIM patch user: id={}", id);
        Map<String, Object> updated = scimService.patchUser(id, patchRequest);
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/Users/{id}")
    public ResponseEntity<Void> deleteUser(@PathVariable String id) {
        log.info("SCIM delete (deactivate) user: id={}", id);
        scimService.deleteUser(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(value = "/Bulk",
            consumes = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE},
            produces = {SCIM_CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE})
    public ResponseEntity<Map<String, Object>> bulkOperation(
            @RequestBody Map<String, Object> bulkRequest) {
        log.info("SCIM bulk operation");
        Map<String, Object> result = scimService.bulkOperation(bulkRequest);
        return ResponseEntity.ok(result);
    }
}
