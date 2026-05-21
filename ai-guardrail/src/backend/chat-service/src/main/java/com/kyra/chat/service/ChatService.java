package com.kyra.chat.service;

import com.kyra.chat.client.MLServiceClient;
import com.kyra.chat.client.RAGServiceClient;
import com.kyra.chat.client.SecurityServiceClient;
import com.kyra.chat.dto.*;
import com.kyra.chat.model.Conversation;
import com.kyra.chat.model.Message;
import com.kyra.chat.model.Message.MessageRole;
import com.kyra.chat.model.Message.MessageStatus;
import com.kyra.chat.model.Persona;
import com.kyra.chat.repository.ConversationRepository;
import com.kyra.chat.repository.MessageRepository;
import com.kyra.chat.repository.PersonaRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatService {

    private final ConversationRepository conversationRepository;
    private final MessageRepository messageRepository;
    private final PersonaRepository personaRepository;
    private final MLServiceClient mlServiceClient;
    private final RAGServiceClient ragServiceClient;
    private final SecurityServiceClient securityServiceClient;
    private final ConversationService conversationService;
    private final MemoryService memoryService;
    private final ObjectMapper objectMapper;

    /**
     * Non-streaming chat flow:
     * 1) DLP scan input
     * 2) Get/create conversation
     * 3) Get persona system prompt
     * 4) Build context (last 10 msgs + memory)
     * 5) Optional RAG search
     * 6) Save user message
     * 7) Call ML service
     * 8) DLP scan output
     * 9) Save assistant message
     * 10) Return response
     */
    public Mono<ChatResponse> chat(ChatRequest request, String userId) {
        // Step 1: DLP scan input
        return securityServiceClient.scan(SecurityServiceClient.ScanRequest.builder()
                        .content(request.getMessage())
                        .direction("input")
                        .userId(userId)
                        .personaId(request.getPersonaId())
                        .build())
                .flatMap(inputScan -> {
                    if (!inputScan.isSafe()) {
                        String findings = inputScan.getFindings().stream()
                                .map(SecurityServiceClient.Finding::getDescription)
                                .collect(Collectors.joining("; "));
                        return Mono.error(new RuntimeException("Input blocked by DLP: " + findings));
                    }

                    String sanitizedInput = inputScan.getSanitizedContent() != null
                            ? inputScan.getSanitizedContent() : request.getMessage();

                    // Step 2: Get or create conversation
                    return Mono.fromCallable(() -> getOrCreateConversation(request, userId))
                            .subscribeOn(Schedulers.boundedElastic())
                            .flatMap(conversation -> {
                                UUID conversationId = conversation.getId();

                                // Step 3: Get persona system prompt
                                Persona persona = request.getPersonaId() != null
                                        ? personaRepository.findById(request.getPersonaId()).orElse(null)
                                        : null;

                                // Step 4: Build context
                                List<MLServiceClient.MessageEntry> context = memoryService.getContext(conversationId);

                                // Add system prompt from persona
                                if (persona != null) {
                                    context.add(0, MLServiceClient.MessageEntry.builder()
                                            .role("system")
                                            .content(persona.getSystemPrompt())
                                            .build());
                                }

                                // Step 5: Optional RAG search
                                Mono<List<ChatResponse.Source>> ragMono;
                                if (request.getRagCollectionIds() != null && !request.getRagCollectionIds().isEmpty()) {
                                    ragMono = ragServiceClient.search(RAGServiceClient.SearchRequest.builder()
                                                    .query(sanitizedInput)
                                                    .collectionIds(request.getRagCollectionIds())
                                                    .topK(5)
                                                    .build())
                                            .map(resp -> resp.getResults().stream()
                                                    .map(r -> ChatResponse.Source.builder()
                                                            .documentId(r.getDocumentId())
                                                            .content(r.getContent())
                                                            .title(r.getTitle())
                                                            .score(r.getScore())
                                                            .build())
                                                    .collect(Collectors.toList()));
                                } else {
                                    ragMono = Mono.just(List.of());
                                }

                                return ragMono.flatMap(sources -> {
                                    // Add RAG context to messages
                                    if (!sources.isEmpty()) {
                                        String ragContext = sources.stream()
                                                .map(s -> "Source [" + s.getTitle() + "]: " + s.getContent())
                                                .collect(Collectors.joining("\n\n"));
                                        context.add(MLServiceClient.MessageEntry.builder()
                                                .role("system")
                                                .content("Relevant context from knowledge base:\n" + ragContext)
                                                .build());
                                    }

                                    // Add current user message
                                    context.add(MLServiceClient.MessageEntry.builder()
                                            .role("user")
                                            .content(sanitizedInput)
                                            .build());

                                    // Step 6: Save user message
                                    return Mono.fromCallable(() -> saveUserMessage(conversationId, sanitizedInput,
                                                    request.getPersonaId(), request.getAttachments()))
                                            .subscribeOn(Schedulers.boundedElastic())
                                            .flatMap(userMessage -> {
                                                // Step 7: Call ML service
                                                MLServiceClient.CompletionRequest completionRequest =
                                                        MLServiceClient.CompletionRequest.builder()
                                                                .messages(context)
                                                                .personaId(request.getPersonaId())
                                                                .build();

                                                return mlServiceClient.complete(completionRequest)
                                                        .flatMap(mlResponse -> {
                                                            // Step 8: DLP scan output
                                                            return securityServiceClient.scan(
                                                                    SecurityServiceClient.ScanRequest.builder()
                                                                            .content(mlResponse.getContent())
                                                                            .direction("output")
                                                                            .userId(userId)
                                                                            .personaId(request.getPersonaId())
                                                                            .build()
                                                            ).flatMap(outputScan -> {
                                                                String responseContent = outputScan.getSanitizedContent() != null
                                                                        ? outputScan.getSanitizedContent()
                                                                        : mlResponse.getContent();

                                                                // Step 9: Save assistant message
                                                                return Mono.fromCallable(() -> saveAssistantMessage(
                                                                                conversationId, responseContent,
                                                                                request.getPersonaId(), sources,
                                                                                mlResponse.getPromptTokens(),
                                                                                mlResponse.getCompletionTokens(),
                                                                                mlResponse.getModelId(),
                                                                                mlResponse.getFinishReason()))
                                                                        .subscribeOn(Schedulers.boundedElastic())
                                                                        .flatMap(assistantMessage -> {
                                                                            // Trigger memory update asynchronously
                                                                            memoryService.updateMemory(conversationId)
                                                                                    .subscribeOn(Schedulers.boundedElastic())
                                                                                    .subscribe();

                                                                            // Step 10: Return response
                                                                            return Mono.just(ChatResponse.builder()
                                                                                    .conversationId(conversationId)
                                                                                    .messageId(assistantMessage.getId())
                                                                                    .response(responseContent)
                                                                                    .sources(sources)
                                                                                    .tokens(ChatResponse.TokenUsage.builder()
                                                                                            .promptTokens(mlResponse.getPromptTokens())
                                                                                            .completionTokens(mlResponse.getCompletionTokens())
                                                                                            .build())
                                                                                    .build());
                                                                        });
                                                            });
                                                        });
                                            });
                                });
                            });
                });
    }

    /**
     * Streaming chat flow: same as chat() but returns Flux<StreamChunk>.
     */
    public Flux<StreamChunk> chatStream(ChatRequest request, String userId) {
        return securityServiceClient.scan(SecurityServiceClient.ScanRequest.builder()
                        .content(request.getMessage())
                        .direction("input")
                        .userId(userId)
                        .personaId(request.getPersonaId())
                        .build())
                .flatMapMany(inputScan -> {
                    if (!inputScan.isSafe()) {
                        String findings = inputScan.getFindings().stream()
                                .map(SecurityServiceClient.Finding::getDescription)
                                .collect(Collectors.joining("; "));
                        return Flux.just(StreamChunk.builder()
                                .type(StreamChunk.ChunkType.ERROR)
                                .content("Input blocked by DLP: " + findings)
                                .build());
                    }

                    String sanitizedInput = inputScan.getSanitizedContent() != null
                            ? inputScan.getSanitizedContent() : request.getMessage();

                    return Mono.fromCallable(() -> getOrCreateConversation(request, userId))
                            .subscribeOn(Schedulers.boundedElastic())
                            .flatMapMany(conversation -> {
                                UUID conversationId = conversation.getId();

                                Persona persona = request.getPersonaId() != null
                                        ? personaRepository.findById(request.getPersonaId()).orElse(null)
                                        : null;

                                List<MLServiceClient.MessageEntry> context = memoryService.getContext(conversationId);

                                if (persona != null) {
                                    context.add(0, MLServiceClient.MessageEntry.builder()
                                            .role("system")
                                            .content(persona.getSystemPrompt())
                                            .build());
                                }

                                // RAG search
                                Mono<List<ChatResponse.Source>> ragMono;
                                if (request.getRagCollectionIds() != null && !request.getRagCollectionIds().isEmpty()) {
                                    ragMono = ragServiceClient.search(RAGServiceClient.SearchRequest.builder()
                                                    .query(sanitizedInput)
                                                    .collectionIds(request.getRagCollectionIds())
                                                    .topK(5)
                                                    .build())
                                            .map(resp -> resp.getResults().stream()
                                                    .map(r -> ChatResponse.Source.builder()
                                                            .documentId(r.getDocumentId())
                                                            .content(r.getContent())
                                                            .title(r.getTitle())
                                                            .score(r.getScore())
                                                            .build())
                                                    .collect(Collectors.toList()));
                                } else {
                                    ragMono = Mono.just(List.of());
                                }

                                return ragMono.flatMapMany(sources -> {
                                    if (!sources.isEmpty()) {
                                        String ragContext = sources.stream()
                                                .map(s -> "Source [" + s.getTitle() + "]: " + s.getContent())
                                                .collect(Collectors.joining("\n\n"));
                                        context.add(MLServiceClient.MessageEntry.builder()
                                                .role("system")
                                                .content("Relevant context from knowledge base:\n" + ragContext)
                                                .build());
                                    }

                                    context.add(MLServiceClient.MessageEntry.builder()
                                            .role("user")
                                            .content(sanitizedInput)
                                            .build());

                                    // Save user message
                                    Message userMessage = saveUserMessage(conversationId, sanitizedInput,
                                            request.getPersonaId(), request.getAttachments());

                                    // Create placeholder assistant message
                                    Message assistantMessage = Message.builder()
                                            .conversationId(conversationId)
                                            .role(MessageRole.ASSISTANT)
                                            .content("")
                                            .personaId(request.getPersonaId())
                                            .status(MessageStatus.STREAMING)
                                            .build();
                                    assistantMessage = messageRepository.save(assistantMessage);
                                    final UUID assistantMessageId = assistantMessage.getId();

                                    MLServiceClient.CompletionRequest completionRequest =
                                            MLServiceClient.CompletionRequest.builder()
                                                    .messages(context)
                                                    .personaId(request.getPersonaId())
                                                    .stream(true)
                                                    .build();

                                    StringBuilder fullResponse = new StringBuilder();

                                    // Stream from ML service
                                    Flux<StreamChunk> contentStream = mlServiceClient.completeStream(completionRequest)
                                            .map(sse -> {
                                                String data = sse.data();
                                                if (data == null || "[DONE]".equals(data)) {
                                                    return null;
                                                }
                                                try {
                                                    JsonNode node = objectMapper.readTree(data);
                                                    String content = node.has("content") ? node.get("content").asText() : "";
                                                    fullResponse.append(content);
                                                    return StreamChunk.builder()
                                                            .type(StreamChunk.ChunkType.CONTENT)
                                                            .content(content)
                                                            .messageId(assistantMessageId)
                                                            .conversationId(conversationId)
                                                            .build();
                                                } catch (JsonProcessingException e) {
                                                    // Treat raw data as content
                                                    fullResponse.append(data);
                                                    return StreamChunk.builder()
                                                            .type(StreamChunk.ChunkType.CONTENT)
                                                            .content(data)
                                                            .messageId(assistantMessageId)
                                                            .conversationId(conversationId)
                                                            .build();
                                                }
                                            })
                                            .filter(Objects::nonNull);

                                    // Sources chunk (if RAG was used)
                                    Flux<StreamChunk> sourcesStream = Flux.empty();
                                    if (!sources.isEmpty()) {
                                        sourcesStream = Flux.just(StreamChunk.builder()
                                                .type(StreamChunk.ChunkType.SOURCES)
                                                .sources(sources)
                                                .messageId(assistantMessageId)
                                                .conversationId(conversationId)
                                                .build());
                                    }

                                    // Done chunk with finalization
                                    Flux<StreamChunk> doneStream = Flux.defer(() -> {
                                        // Save the completed assistant message
                                        Message saved = messageRepository.findById(assistantMessageId).orElse(null);
                                        if (saved != null) {
                                            saved.setContent(fullResponse.toString());
                                            saved.setStatus(MessageStatus.COMPLETED);
                                            saved.setRagSources(sources.isEmpty() ? null : sources);
                                            messageRepository.save(saved);
                                        }
                                        conversationService.incrementMessageCount(conversationId);

                                        // Trigger memory update
                                        memoryService.updateMemory(conversationId)
                                                .subscribeOn(Schedulers.boundedElastic())
                                                .subscribe();

                                        return Flux.just(StreamChunk.builder()
                                                .type(StreamChunk.ChunkType.DONE)
                                                .messageId(assistantMessageId)
                                                .conversationId(conversationId)
                                                .build());
                                    }).subscribeOn(Schedulers.boundedElastic());

                                    return Flux.concat(contentStream, sourcesStream, doneStream);
                                });
                            });
                })
                .onErrorResume(e -> {
                    log.error("Chat stream error: {}", e.getMessage(), e);
                    return Flux.just(StreamChunk.builder()
                            .type(StreamChunk.ChunkType.ERROR)
                            .content(e.getMessage())
                            .build());
                });
    }

    /**
     * Regenerate the last assistant message in a conversation.
     */
    public Mono<ChatResponse> regenerate(UUID conversationId, String userId) {
        return Mono.fromCallable(() -> {
                    Conversation conv = conversationRepository.findById(conversationId)
                            .orElseThrow(() -> new RuntimeException("Conversation not found"));
                    if (!conv.getUserId().equals(userId)) {
                        throw new RuntimeException("Access denied");
                    }

                    // Find last user message
                    List<Message> recent = messageRepository
                            .findTop10ByConversationIdOrderByCreatedAtDesc(conversationId);
                    Message lastUserMessage = recent.stream()
                            .filter(m -> m.getRole() == MessageRole.USER)
                            .findFirst()
                            .orElseThrow(() -> new RuntimeException("No user message to regenerate from"));

                    return ChatRequest.builder()
                            .conversationId(conversationId)
                            .message(lastUserMessage.getContent())
                            .personaId(conv.getPersonaId())
                            .build();
                })
                .subscribeOn(Schedulers.boundedElastic())
                .flatMap(req -> chat(req, userId));
    }

    @Transactional
    private Conversation getOrCreateConversation(ChatRequest request, String userId) {
        if (request.getConversationId() != null) {
            Conversation conv = conversationRepository.findById(request.getConversationId())
                    .orElseThrow(() -> new RuntimeException("Conversation not found: " + request.getConversationId()));
            if (!conv.getUserId().equals(userId)) {
                throw new RuntimeException("Access denied to conversation");
            }
            return conv;
        }

        // Create new conversation
        Conversation conv = Conversation.builder()
                .userId(userId)
                .title(request.getMessage().length() > 50
                        ? request.getMessage().substring(0, 50) + "..."
                        : request.getMessage())
                .personaId(request.getPersonaId())
                .purposeId(request.getPurposeId())
                .status(Conversation.ConversationStatus.ACTIVE)
                .isPinned(false)
                .messageCount(0)
                .lastMessageAt(LocalDateTime.now())
                .build();
        return conversationRepository.save(conv);
    }

    @Transactional
    private Message saveUserMessage(UUID conversationId, String content, String personaId, Object attachments) {
        Message msg = Message.builder()
                .conversationId(conversationId)
                .role(MessageRole.USER)
                .content(content)
                .personaId(personaId)
                .attachments(attachments)
                .status(MessageStatus.COMPLETED)
                .build();
        msg = messageRepository.save(msg);
        conversationService.incrementMessageCount(conversationId);
        return msg;
    }

    @Transactional
    private Message saveAssistantMessage(UUID conversationId, String content, String personaId,
                                         List<ChatResponse.Source> sources, Integer promptTokens,
                                         Integer completionTokens, String modelId, String finishReason) {
        Message msg = Message.builder()
                .conversationId(conversationId)
                .role(MessageRole.ASSISTANT)
                .content(content)
                .personaId(personaId)
                .ragSources(sources.isEmpty() ? null : sources)
                .promptTokens(promptTokens)
                .completionTokens(completionTokens)
                .modelId(modelId)
                .finishReason(finishReason)
                .status(MessageStatus.COMPLETED)
                .build();
        msg = messageRepository.save(msg);
        conversationService.incrementMessageCount(conversationId);
        return msg;
    }
}
