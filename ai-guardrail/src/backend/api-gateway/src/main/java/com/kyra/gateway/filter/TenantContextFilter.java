package com.kyra.gateway.filter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

@Slf4j
@Component
public class TenantContextFilter implements GlobalFilter, Ordered {

    private static final String CACHE_PREFIX = "gateway:tenant:";
    private static final Duration CACHE_TTL = Duration.ofMinutes(5);
    private static final String TENANT_ID_HEADER = "X-Tenant-ID";
    private static final String TENANT_TIER_HEADER = "X-Tenant-Tier";

    private final ReactiveStringRedisTemplate redisTemplate;
    private final WebClient webClient;
    private final ObjectMapper objectMapper;

    public TenantContextFilter(
            ReactiveStringRedisTemplate redisTemplate,
            @Value("${services.tenant-service.url:http://localhost:8026}") String tenantServiceUrl) {
        this.redisTemplate = redisTemplate;
        this.webClient = WebClient.builder()
                .baseUrl(tenantServiceUrl)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getURI().getPath();

        // Skip tenant resolution for public/health endpoints
        if (path.startsWith("/health") || path.startsWith("/actuator") || path.startsWith("/api/v1/auth/login")) {
            return chain.filter(exchange);
        }

        // 1. Try X-Tenant-ID header
        String tenantId = request.getHeaders().getFirst(TENANT_ID_HEADER);

        // 2. Try subdomain (e.g., acme.kyra.ai)
        if (tenantId == null) {
            String host = request.getHeaders().getFirst("Host");
            if (host != null) {
                String subdomain = extractSubdomain(host);
                if (subdomain != null) {
                    return resolveBySlug(subdomain, exchange, chain);
                }
            }
        }

        // 3. Try JWT tenant_id claim (set by auth filter as header)
        if (tenantId == null) {
            // The auth filter may have already extracted this from JWT
            tenantId = request.getHeaders().getFirst("X-JWT-Tenant-ID");
        }

        if (tenantId == null) {
            // No tenant context available - let the request through without tenant headers
            // Individual services can decide whether tenant context is required
            return chain.filter(exchange);
        }

        return resolveById(tenantId, exchange, chain);
    }

    private Mono<Void> resolveById(String tenantId, ServerWebExchange exchange, GatewayFilterChain chain) {
        String cacheKey = CACHE_PREFIX + tenantId;

        return redisTemplate.opsForValue().get(cacheKey)
                .flatMap(cached -> handleCachedContext(cached, exchange, chain))
                .switchIfEmpty(
                        fetchTenantContextById(tenantId)
                                .flatMap(json -> cacheAndProceed(cacheKey, json, exchange, chain))
                )
                .onErrorResume(e -> {
                    log.warn("Tenant resolution failed for id={}: {}", tenantId, e.getMessage());
                    return onForbidden(exchange, "Tenant resolution failed");
                });
    }

    private Mono<Void> resolveBySlug(String slug, ServerWebExchange exchange, GatewayFilterChain chain) {
        String cacheKey = CACHE_PREFIX + "slug:" + slug;

        return redisTemplate.opsForValue().get(cacheKey)
                .flatMap(cached -> handleCachedContext(cached, exchange, chain))
                .switchIfEmpty(
                        fetchTenantContextBySlug(slug)
                                .flatMap(json -> cacheAndProceed(cacheKey, json, exchange, chain))
                )
                .onErrorResume(e -> {
                    log.warn("Tenant resolution failed for slug={}: {}", slug, e.getMessage());
                    return onForbidden(exchange, "Tenant resolution failed");
                });
    }

    private Mono<Void> handleCachedContext(String cached, ServerWebExchange exchange, GatewayFilterChain chain) {
        try {
            JsonNode node = objectMapper.readTree(cached);
            String status = node.path("status").asText();
            if ("suspended".equals(status) || "cancelled".equals(status)) {
                return onForbidden(exchange, "Tenant is " + status);
            }
            String tenantId = node.path("tenantId").asText();
            String tier = node.path("tier").asText();
            return addTenantHeadersAndContinue(exchange, chain, tenantId, tier);
        } catch (Exception e) {
            log.warn("Failed to parse cached tenant context: {}", e.getMessage());
            return chain.filter(exchange);
        }
    }

    private Mono<String> fetchTenantContextById(String tenantId) {
        return webClient.get()
                .uri("/v1/tenants/context/{id}", tenantId)
                .retrieve()
                .bodyToMono(String.class);
    }

    private Mono<String> fetchTenantContextBySlug(String slug) {
        return webClient.get()
                .uri("/v1/tenants/context/by-slug/{slug}", slug)
                .retrieve()
                .bodyToMono(String.class);
    }

    private Mono<Void> cacheAndProceed(String cacheKey, String json, ServerWebExchange exchange, GatewayFilterChain chain) {
        try {
            JsonNode node = objectMapper.readTree(json);
            String status = node.path("status").asText();

            if ("suspended".equals(status) || "cancelled".equals(status)) {
                // Still cache it so we don't keep hitting the service
                return redisTemplate.opsForValue().set(cacheKey, json, CACHE_TTL)
                        .then(onForbidden(exchange, "Tenant is " + status));
            }

            String tenantId = node.path("tenantId").asText();
            String tier = node.path("tier").asText();

            return redisTemplate.opsForValue().set(cacheKey, json, CACHE_TTL)
                    .then(addTenantHeadersAndContinue(exchange, chain, tenantId, tier));
        } catch (Exception e) {
            log.warn("Failed to parse tenant context response: {}", e.getMessage());
            return chain.filter(exchange);
        }
    }

    private Mono<Void> addTenantHeadersAndContinue(
            ServerWebExchange exchange, GatewayFilterChain chain,
            String tenantId, String tier) {

        ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                .header(TENANT_ID_HEADER, tenantId)
                .header(TENANT_TIER_HEADER, tier)
                .build();

        return chain.filter(exchange.mutate().request(mutatedRequest).build());
    }

    /**
     * Extract subdomain from host header.
     * e.g., "acme.kyra.ai" -> "acme", "kyra.ai" -> null, "localhost" -> null
     */
    private String extractSubdomain(String host) {
        // Remove port if present
        String hostname = host.contains(":") ? host.substring(0, host.indexOf(':')) : host;

        // Skip localhost and IP addresses
        if (hostname.equals("localhost") || hostname.matches("\\d+\\.\\d+\\.\\d+\\.\\d+")) {
            return null;
        }

        String[] parts = hostname.split("\\.");
        // Need at least 3 parts for a subdomain (e.g., acme.kyra.ai)
        if (parts.length >= 3) {
            String subdomain = parts[0];
            // Ignore common non-tenant subdomains
            if ("www".equals(subdomain) || "api".equals(subdomain) || "app".equals(subdomain)) {
                return null;
            }
            return subdomain;
        }

        return null;
    }

    private Mono<Void> onForbidden(ServerWebExchange exchange, String message) {
        log.warn("Tenant access denied for {}: {}", exchange.getRequest().getURI().getPath(), message);
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.FORBIDDEN);
        response.getHeaders().add("Content-Type", "application/json");
        byte[] bytes = ("{\"error\":\"Forbidden\",\"message\":\"" + message + "\"}").getBytes(StandardCharsets.UTF_8);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(bytes)));
    }

    @Override
    public int getOrder() {
        return -95;
    }
}
