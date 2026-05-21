package com.kyra.gateway.filter;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

import java.util.UUID;

@Component
public class RequestIdFilter implements GlobalFilter, Ordered {

    private static final String REQUEST_ID_HEADER = "X-Request-Id";

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String requestId = exchange.getRequest().getHeaders().getFirst(REQUEST_ID_HEADER);

        if (requestId == null || requestId.isBlank()) {
            requestId = UUID.randomUUID().toString();
            ServerHttpRequest mutatedRequest = exchange.getRequest().mutate()
                    .header(REQUEST_ID_HEADER, requestId)
                    .build();
            ServerWebExchange mutatedExchange = exchange.mutate()
                    .request(mutatedRequest)
                    .build();
            mutatedExchange.getResponse().getHeaders().add(REQUEST_ID_HEADER, requestId);
            return chain.filter(mutatedExchange);
        }

        exchange.getResponse().getHeaders().add(REQUEST_ID_HEADER, requestId);
        return chain.filter(exchange);
    }

    @Override
    public int getOrder() {
        return -200;
    }
}
