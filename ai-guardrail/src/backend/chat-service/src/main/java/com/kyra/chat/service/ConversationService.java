package com.kyra.chat.service;

import com.kyra.chat.dto.ConversationDTO;
import com.kyra.chat.dto.CreateConversationRequest;
import com.kyra.chat.model.Conversation;
import com.kyra.chat.model.Conversation.ConversationStatus;
import com.kyra.chat.repository.ConversationRepository;
import com.kyra.chat.repository.PersonaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ConversationService {

    private final ConversationRepository conversationRepository;
    private final PersonaRepository personaRepository;

    public Page<ConversationDTO> listConversations(String userId, Pageable pageable) {
        return conversationRepository
                .findByUserIdAndStatusOrderByLastMessageAtDesc(userId, ConversationStatus.ACTIVE, pageable)
                .map(this::toDTO);
    }

    public ConversationDTO getConversation(UUID id, String userId) {
        Conversation conv = conversationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Conversation not found: " + id));
        if (!conv.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to conversation: " + id);
        }
        return toDTO(conv);
    }

    @Transactional
    public ConversationDTO createConversation(CreateConversationRequest request, String userId) {
        Conversation conv = Conversation.builder()
                .userId(userId)
                .title(request.getTitle() != null ? request.getTitle() : "New Conversation")
                .personaId(request.getPersonaId())
                .purposeId(request.getPurposeId())
                .status(ConversationStatus.ACTIVE)
                .isPinned(false)
                .messageCount(0)
                .lastMessageAt(LocalDateTime.now())
                .build();
        conv = conversationRepository.save(conv);
        log.info("Created conversation {} for user {}", conv.getId(), userId);
        return toDTO(conv);
    }

    @Transactional
    public ConversationDTO updateConversation(UUID id, String userId, String title, Boolean isPinned) {
        Conversation conv = conversationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Conversation not found: " + id));
        if (!conv.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to conversation: " + id);
        }
        if (title != null) {
            conv.setTitle(title);
        }
        if (isPinned != null) {
            conv.setIsPinned(isPinned);
        }
        conv = conversationRepository.save(conv);
        return toDTO(conv);
    }

    @Transactional
    public void deleteConversation(UUID id, String userId) {
        Conversation conv = conversationRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Conversation not found: " + id));
        if (!conv.getUserId().equals(userId)) {
            throw new RuntimeException("Access denied to conversation: " + id);
        }
        conv.setStatus(ConversationStatus.DELETED);
        conversationRepository.save(conv);
        log.info("Soft-deleted conversation {} for user {}", id, userId);
    }

    @Transactional
    public void incrementMessageCount(UUID conversationId) {
        Conversation conv = conversationRepository.findById(conversationId).orElse(null);
        if (conv != null) {
            conv.setMessageCount(conv.getMessageCount() + 1);
            conv.setLastMessageAt(LocalDateTime.now());
            conversationRepository.save(conv);
        }
    }

    private ConversationDTO toDTO(Conversation conv) {
        String personaName = null;
        if (conv.getPersonaId() != null) {
            personaName = personaRepository.findById(conv.getPersonaId())
                    .map(p -> p.getName())
                    .orElse(null);
        }
        return ConversationDTO.builder()
                .id(conv.getId())
                .title(conv.getTitle())
                .personaId(conv.getPersonaId())
                .personaName(personaName)
                .status(conv.getStatus())
                .isPinned(conv.getIsPinned())
                .messageCount(conv.getMessageCount())
                .lastMessageAt(conv.getLastMessageAt())
                .createdAt(conv.getCreatedAt())
                .build();
    }
}
