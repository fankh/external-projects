package com.kyra.chat.controller;

import com.kyra.chat.config.SecurityConfig;
import com.kyra.chat.config.SecurityConfig.UserContext;
import com.kyra.chat.dto.ConversationDTO;
import com.kyra.chat.dto.CreateConversationRequest;
import com.kyra.chat.service.ConversationService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/v1/conversations")
@RequiredArgsConstructor
public class ConversationController {

    private final ConversationService conversationService;
    private final com.kyra.chat.repository.MessageRepository messageRepository;

    @GetMapping
    public Mono<Page<ConversationDTO>> listConversations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return Mono.fromCallable(() ->
                        conversationService.listConversations(user.getUserId(), PageRequest.of(page, size)))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ConversationDTO> createConversation(
            @RequestBody CreateConversationRequest request,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return Mono.fromCallable(() ->
                        conversationService.createConversation(request, user.getUserId()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @GetMapping("/{id}")
    public Mono<ConversationDTO> getConversation(
            @PathVariable UUID id,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return Mono.fromCallable(() ->
                        conversationService.getConversation(id, user.getUserId()))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @PatchMapping("/{id}")
    public Mono<ConversationDTO> updateConversation(
            @PathVariable UUID id,
            @RequestBody Map<String, Object> updates,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        String title = updates.containsKey("title") ? (String) updates.get("title") : null;
        Boolean isPinned = updates.containsKey("isPinned") ? (Boolean) updates.get("isPinned") : null;
        return Mono.fromCallable(() ->
                        conversationService.updateConversation(id, user.getUserId(), title, isPinned))
                .subscribeOn(Schedulers.boundedElastic());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> deleteConversation(
            @PathVariable UUID id,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return Mono.fromRunnable(() ->
                        conversationService.deleteConversation(id, user.getUserId()))
                .subscribeOn(Schedulers.boundedElastic())
                .then();
    }

    private UserContext getUserContext(ServerWebExchange exchange) {
        return exchange.getAttribute(SecurityConfig.USER_CONTEXT_ATTR);
    }

    public record EditMessageReq(String content) {}

    @org.springframework.web.bind.annotation.PutMapping("/messages/{id}")
    public org.springframework.http.ResponseEntity<com.kyra.chat.dto.MessageDTO> editMessage(
            @org.springframework.web.bind.annotation.PathVariable java.util.UUID id,
            @org.springframework.web.bind.annotation.RequestBody EditMessageReq req) {
        com.kyra.chat.model.Message m = messageRepository.findById(id)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND, "Message not found"));
        // Only user role messages are editable (assistant messages are immutable in chat history)
        if (m.getRole() != com.kyra.chat.model.Message.MessageRole.USER) {
            throw new org.springframework.web.server.ResponseStatusException(
                org.springframework.http.HttpStatus.FORBIDDEN, "Only user messages can be edited");
        }
        m.setContent(req.content());
        m.setIsEdited(true);
        m.setEditedAt(java.time.LocalDateTime.now(java.time.ZoneOffset.UTC));
        m = messageRepository.save(m);
        return org.springframework.http.ResponseEntity.ok(com.kyra.chat.dto.MessageDTO.builder()
                .id(m.getId())
                .role(m.getRole())
                .content(m.getContent())
                .personaId(m.getPersonaId())
                .createdAt(m.getCreatedAt())
                .build());
    }

    public record SearchHit(java.util.UUID id, java.util.UUID conversationId, String content,
                             String role, java.time.Instant createdAt) {}

    @GetMapping("/search")
    public java.util.List<SearchHit> searchMessages(
            @RequestParam String q,
            @RequestParam(defaultValue = "25") int limit,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        String query = q == null ? "" : q.trim();
        if (query.length() < 2) return java.util.Collections.emptyList();
        java.util.UUID uid = java.util.UUID.fromString(user.getUserId());
        return messageRepository.searchByUserAndContent(uid, "%" + query + "%", limit);
    }

    @GetMapping("/{id}/export")
    public Mono<org.springframework.http.ResponseEntity<byte[]>> exportConversation(
            @PathVariable java.util.UUID id,
            @RequestParam(defaultValue = "json") String format,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        return Mono.fromCallable(() -> {
            var conv = conversationService.getConversation(id, user.getUserId());
            var messages = messageRepository.findByConversationIdOrderByCreatedAtDesc(id, org.springframework.data.domain.PageRequest.of(0, 10000));
            var sb = new StringBuilder();

            if ("markdown".equalsIgnoreCase(format) || "md".equalsIgnoreCase(format)) {
                sb.append("# ").append(conv.getTitle()).append("\n\n");
                sb.append("*Exported at: ").append(java.time.Instant.now()).append("*\n\n---\n\n");
                for (var msg : messages) {
                    String role = msg.getRole() != null ? msg.getRole().name() : "?";
                    sb.append("**").append(role).append("**: ").append(msg.getContent()).append("\n\n");
                }
                byte[] body = sb.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8);
                return org.springframework.http.ResponseEntity.ok()
                    .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=conversation-" + id + ".md")
                    .contentType(org.springframework.http.MediaType.TEXT_PLAIN)
                    .body(body);
            }

            // Default: JSON
            var map = new java.util.LinkedHashMap<String, Object>();
            map.put("conversationId", id.toString());
            map.put("title", conv.getTitle());
            map.put("exportedAt", java.time.Instant.now().toString());
            var msgList = new java.util.ArrayList<java.util.Map<String, Object>>();
            for (var msg : messages) {
                var m = new java.util.LinkedHashMap<String, Object>();
                m.put("role", msg.getRole() != null ? msg.getRole().name() : null);
                m.put("content", msg.getContent());
                m.put("createdAt", msg.getCreatedAt() != null ? msg.getCreatedAt().toString() : null);
                msgList.add(m);
            }
            map.put("messages", msgList);
            map.put("messageCount", msgList.size());

            var om = new com.fasterxml.jackson.databind.ObjectMapper();
            byte[] body = om.writerWithDefaultPrettyPrinter().writeValueAsBytes(map);
            return org.springframework.http.ResponseEntity.ok()
                .header(org.springframework.http.HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=conversation-" + id + ".json")
                .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .body(body);
        }).subscribeOn(reactor.core.scheduler.Schedulers.boundedElastic());
    }
}
