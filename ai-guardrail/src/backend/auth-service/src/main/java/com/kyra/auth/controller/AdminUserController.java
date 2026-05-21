package com.kyra.auth.controller;

import com.kyra.auth.model.User;
import com.kyra.auth.repository.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/v1/admin/users")
@RequiredArgsConstructor
public class AdminUserController {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final com.kyra.auth.repository.RoleRepository roleRepository;

    private void requireAdmin(HttpServletRequest req) {
        String role = req.getHeader("X-User-Role");
        if (!"admin".equalsIgnoreCase(role)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Admin role required");
        }
    }

    private Map<String, Object> toDto(User u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("email", u.getEmail());
        m.put("name", u.getName());
        m.put("role", u.getRoleId() == null ? "user" : u.getRoleId().toString());
        m.put("department", u.getDepartmentId() == null ? "" : u.getDepartmentId().toString());
        m.put("status", u.getStatus() == null ? "" : u.getStatus().name().toLowerCase());
        m.put("lastLogin", u.getLastLoginAt() == null ? null : u.getLastLoginAt().toString());
        m.put("mfaEnabled", u.isMfaEnabled());
        m.put("createdAt", u.getCreatedAt() == null ? null : u.getCreatedAt().toString());
        return m;
    }

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list(HttpServletRequest req) {
        requireAdmin(req);
        return ResponseEntity.ok(userRepository.findAll().stream().map(this::toDto).collect(Collectors.toList()));
    }

    public record CreateUserReq(String email, String name, String password, String role, String department) {}

    @PostMapping
    public ResponseEntity<Map<String, Object>> create(HttpServletRequest req, @RequestBody CreateUserReq r) {
        requireAdmin(req);
        if (r.email() == null || r.password() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "email + password required");
        }
        User u = User.builder()
                .id(UUID.randomUUID())
                .email(r.email())
                .passwordHash(passwordEncoder.encode(r.password()))
                .name(r.name() == null ? r.email() : r.name())
                .status(User.Status.ACTIVE)
                .build();
        u = userRepository.save(u);
        return ResponseEntity.ok(toDto(u));
    }

    public record RoleReq(String role) {}

    @PutMapping("/{id}/role")
    public ResponseEntity<Map<String, Object>> setRole(HttpServletRequest req, @PathVariable UUID id, @RequestBody RoleReq r) {
        requireAdmin(req);
        User u = userRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (r.role() == null || r.role().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "role is required");
        }
        com.kyra.auth.model.Role role = roleRepository.findByName(r.role())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown role: " + r.role()));
        u.setRoleId(role.getId());
        u = userRepository.save(u);
        return ResponseEntity.ok(toDto(u));
    }

    @PostMapping("/{id}/suspend")
    public ResponseEntity<Map<String, Object>> suspend(HttpServletRequest req, @PathVariable UUID id) {
        requireAdmin(req);
        User u = userRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        u.setStatus(User.Status.LOCKED);
        u.setLockedUntil(Instant.now().plusSeconds(365L * 24 * 3600));
        return ResponseEntity.ok(toDto(userRepository.save(u)));
    }

    @PostMapping("/{id}/activate")
    public ResponseEntity<Map<String, Object>> activate(HttpServletRequest req, @PathVariable UUID id) {
        requireAdmin(req);
        User u = userRepository.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        u.setStatus(User.Status.ACTIVE);
        u.setLockedUntil(null);
        return ResponseEntity.ok(toDto(userRepository.save(u)));
    }
}
