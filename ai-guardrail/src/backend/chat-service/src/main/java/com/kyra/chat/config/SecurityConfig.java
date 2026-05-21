package com.kyra.chat.config;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

@Component
public class SecurityConfig implements WebFilter {

    public static final String USER_CONTEXT_ATTR = "userContext";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        String path = exchange.getRequest().getPath().value();

        // Skip auth for actuator endpoints
        if (path.startsWith("/actuator")) {
            return chain.filter(exchange);
        }

        String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
        String userEmail = exchange.getRequest().getHeaders().getFirst("X-User-Email");
        String userRole = exchange.getRequest().getHeaders().getFirst("X-User-Role");

        if (userId == null || userId.isBlank()) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        UserContext ctx = UserContext.builder()
                .userId(userId)
                .email(userEmail)
                .role(userRole != null ? userRole : "user")
                .build();

        exchange.getAttributes().put(USER_CONTEXT_ATTR, ctx);
        return chain.filter(exchange);
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
