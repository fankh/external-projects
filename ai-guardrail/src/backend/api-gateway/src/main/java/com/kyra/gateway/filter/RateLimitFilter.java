package com.kyra.gateway.filter;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class RateLimitFilter implements GlobalFilter, Ordered {

    private static final String RATE_LIMIT_KEY_PREFIX = "rate_limit:";

    private final ReactiveStringRedisTemplate redisTemplate;

    @Value("${rate-limit.default-limit:100}")
    private int defaultLimit;

    @Value("${rate-limit.window-seconds:60}")
    private int windowSeconds;

    @Value("#{${rate-limit.role-limits:{ADMIN: 500, USER: 100, VIEWER: 50}}}")
    private Map<String, Integer> roleLimits;

    private static final String LUA_SCRIPT = """
            local key = KEYS[1]
            local window = tonumber(ARGV[1])
            local limit = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local window_start = now - window
            redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
            local count = redis.call('ZCARD', key)
            if count < limit then
                redis.call('ZADD', key, now, now .. '-' .. math.random(1000000))
                redis.call('EXPIRE', key, window)
                return 1
            end
            return 0
            """;

    private final RedisScript<Long> rateLimitScript;

    public RateLimitFilter(ReactiveStringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.rateLimitScript = RedisScript.of(LUA_SCRIPT, Long.class);
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
        if (userId == null || userId.isBlank()) {
            return chain.filter(exchange);
        }

        String role = exchange.getRequest().getHeaders().getFirst("X-User-Role");
        int limit = resolveLimit(role);
        String key = RATE_LIMIT_KEY_PREFIX + userId;
        long now = Instant.now().getEpochSecond();

        return redisTemplate.execute(
                        rateLimitScript,
                        List.of(key),
                        List.of(String.valueOf(windowSeconds), String.valueOf(limit), String.valueOf(now)))
                .next()
                .defaultIfEmpty(1L)
                .flatMap(allowed -> {
                    if (allowed == 1L) {
                        return chain.filter(exchange);
                    }
                    return onRateLimited(exchange);
                })
                .onErrorResume(e -> {
                    log.warn("Rate limit check failed, allowing request: {}", e.getMessage());
                    return chain.filter(exchange);
                });
    }

    private int resolveLimit(String role) {
        if (role == null || role.isBlank()) {
            return defaultLimit;
        }
        return roleLimits.getOrDefault(role.toUpperCase(), defaultLimit);
    }

    private Mono<Void> onRateLimited(ServerWebExchange exchange) {
        log.warn("Rate limit exceeded for user: {}",
                exchange.getRequest().getHeaders().getFirst("X-User-Id"));
        ServerHttpResponse response = exchange.getResponse();
        response.setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
        response.getHeaders().add("Content-Type", "application/json");
        byte[] bytes = "{\"error\":\"Too Many Requests\",\"message\":\"Rate limit exceeded. Please try again later.\"}"
                .getBytes(StandardCharsets.UTF_8);
        return response.writeWith(Mono.just(response.bufferFactory().wrap(bytes)));
    }

    @Override
    public int getOrder() {
        return -90;
    }
}
