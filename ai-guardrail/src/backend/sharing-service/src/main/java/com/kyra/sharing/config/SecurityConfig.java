package com.kyra.sharing.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class SecurityConfig extends OncePerRequestFilter {

    public static final String USER_CONTEXT_ATTR = "userContext";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();

        // Skip auth for actuator endpoints
        if (path.startsWith("/actuator")) {
            chain.doFilter(request, response);
            return;
        }

        // Skip auth for public share link viewing
        if (path.startsWith("/v1/share/link/")) {
            chain.doFilter(request, response);
            return;
        }

        String userId = request.getHeader("X-User-Id");
        String userEmail = request.getHeader("X-User-Email");
        String userRole = request.getHeader("X-User-Role");

        if (userId == null || userId.isBlank()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        UserContext ctx = UserContext.builder()
                .userId(userId)
                .email(userEmail)
                .role(userRole != null ? userRole : "user")
                .build();

        request.setAttribute(USER_CONTEXT_ATTR, ctx);
        chain.doFilter(request, response);
    }

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class UserContext {
        private String userId;
        private String email;
        private String role;
    }
}
