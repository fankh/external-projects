package com.kyra.common.security;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserPrincipal {

    private UUID id;
    private String email;
    private String name;
    private String role;
    private UUID departmentId;

    @Builder.Default
    private List<String> permissions = new ArrayList<>();

    public boolean hasPermission(String permission) {
        return permissions != null && permissions.contains(permission);
    }

    public boolean hasAnyPermission(String... perms) {
        if (permissions == null) return false;
        for (String p : perms) {
            if (permissions.contains(p)) return true;
        }
        return false;
    }
}
