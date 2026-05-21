package com.kyra.chat.controller;

import com.kyra.chat.config.SecurityConfig;
import com.kyra.chat.config.SecurityConfig.UserContext;
import com.kyra.chat.dto.ChatRequest;
import com.kyra.chat.dto.ChatResponse;
import com.kyra.chat.dto.StreamChunk;
import com.kyra.chat.service.ChatService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/chat")
@RequiredArgsConstructor
public class ChatController {

    private final ChatService chatService;

    @PostMapping("/message")
    public Mono<ChatResponse> sendMessage(
            @Valid @RequestBody ChatRequest request,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return chatService.chat(request, user.getUserId());
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<StreamChunk>> streamMessage(
            @Valid @RequestBody ChatRequest request,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return chatService.chatStream(request, user.getUserId())
                .map(chunk -> ServerSentEvent.<StreamChunk>builder()
                        .event(chunk.getType().name().toLowerCase())
                        .data(chunk)
                        .build());
    }

    @PostMapping("/regenerate")
    public Mono<ChatResponse> regenerate(
            @RequestBody Map<String, String> body,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        UUID conversationId = UUID.fromString(body.get("conversationId"));
        return chatService.regenerate(conversationId, user.getUserId());
    }

    private UserContext getUserContext(ServerWebExchange exchange) {
        return exchange.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }
}
