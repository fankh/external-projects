package com.kyra.chat.service;

import com.kyra.chat.client.MLServiceClient;
import com.kyra.chat.model.Conversation;
import com.kyra.chat.model.Message;
import com.kyra.chat.repository.ConversationRepository;
import com.kyra.chat.repository.MessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class MemoryService {

    private final MessageRepository messageRepository;
    private final ConversationRepository conversationRepository;
    private final MLServiceClient mlServiceClient;

    @Value("${chat.context.max-messages:10}")
    private int maxContextMessages;

    @Value("${chat.memory.update-interval:10}")
    private int memoryUpdateInterval;

    /**
     * Builds context for the LLM: memory summary + last N messages.
     */
    public List<MLServiceClient.MessageEntry> getContext(UUID conversationId) {
        List<MLServiceClient.MessageEntry> context = new ArrayList<>();

        Conversation conv = conversationRepository.findById(conversationId).orElse(null);
        if (conv == null) {
            return context;
        }

        // Add memory summary as system context if available
        if (conv.getMemorySummary() != null && !conv.getMemorySummary().isBlank()) {
            context.add(MLServiceClient.MessageEntry.builder()
                    .role("system")
                    .content("Previous conversation summary:\n" + conv.getMemorySummary())
                    .build());
        }

        // Get last N messages in chronological order
        List<Message> recentMessages = messageRepository
                .findTop10ByConversationIdOrderByCreatedAtDesc(conversationId);
        Collections.reverse(recentMessages);

        for (Message msg : recentMessages) {
            context.add(MLServiceClient.MessageEntry.builder()
                    .role(msg.getRole().name().toLowerCase())
                    .content(msg.getContent())
                    .build());
        }

        return context;
    }

    /**
     * Triggers memory summarization every N messages.
     */
    @Transactional
    public Mono<Void> updateMemory(UUID conversationId) {
        Conversation conv = conversationRepository.findById(conversationId).orElse(null);
        if (conv == null) {
            return Mono.empty();
        }

        // Only summarize every N messages
        if (conv.getMessageCount() % memoryUpdateInterval != 0) {
            return Mono.empty();
        }

        log.info("Updating memory summary for conversation {}, message count: {}",
                conversationId, conv.getMessageCount());

        // Build summarization request from recent messages
        List<Message> messages = messageRepository
                .findTop10ByConversationIdOrderByCreatedAtDesc(conversationId);
        Collections.reverse(messages);

        String conversationText = messages.stream()
                .map(m -> m.getRole().name() + ": " + m.getContent())
                .collect(Collectors.joining("\n"));

        String existingSummary = conv.getMemorySummary() != null ? conv.getMemorySummary() : "";

        MLServiceClient.CompletionRequest summaryRequest = MLServiceClient.CompletionRequest.builder()
                .messages(List.of(
                        MLServiceClient.MessageEntry.builder()
                                .role("system")
                                .content("Summarize the following conversation concisely, preserving key facts, decisions, and context. " +
                                        "If there is an existing summary, integrate new information into it.")
                                .build(),
                        MLServiceClient.MessageEntry.builder()
                                .role("user")
                                .content("Existing summary:\n" + existingSummary +
                                        "\n\nRecent conversation:\n" + conversationText)
                                .build()
                ))
                .maxTokens(500)
                .temperature(0.3)
                .build();

        return mlServiceClient.complete(summaryRequest)
                .doOnNext(response -> {
                    conv.setMemorySummary(response.getContent());
                    conversationRepository.save(conv);
                    log.info("Updated memory summary for conversation {}", conversationId);
                })
                .doOnError(e -> log.error("Failed to update memory for conversation {}: {}",
                        conversationId, e.getMessage()))
                .then();
    }
}
