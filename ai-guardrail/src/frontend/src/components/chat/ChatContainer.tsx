"use client";

import React, { useEffect, useRef, useCallback } from "react";
import { Bot, MessageSquare } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChatStore } from "@/stores/chat-store";
import { useStreaming } from "@/lib/streaming";
import { api } from "@/lib/api";
import type { Message, Conversation, Citation } from "@/types";

interface ChatContainerProps {
  conversationId?: string;
}

export function ChatContainer({ conversationId }: ChatContainerProps) {
  const {
    messages,
    setMessages,
    addMessage,
    streamingMessage,
    streamingCitations,
    appendStreamingContent,
    setStreamingCitations,
    clearStreaming,
    activeConversationId,
    setActiveConversation,
    addConversation,
    selectedPersonaId,
    isLoadingMessages,
    setIsLoadingMessages,
  } = useChatStore();

  const { isStreaming, startStream, stopStream } = useStreaming();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      setActiveConversation(conversationId);
      setIsLoadingMessages(true);
      api
        .get<Message[]>(`/conversations/${conversationId}/messages`)
        .then(setMessages)
        .catch(() => {})
        .finally(() => setIsLoadingMessages(false));
    }
  }, [conversationId, setActiveConversation, setMessages, setIsLoadingMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  const handleSend = useCallback(
    async (content: string, files?: File[]) => {
      let currentConvId = conversationId || activeConversationId;

      // Create new conversation if needed
      if (!currentConvId) {
        try {
          const conv = await api.post<Conversation>("/conversations", {
            title: content.slice(0, 100),
            persona_id: selectedPersonaId,
          });
          currentConvId = conv.id;
          setActiveConversation(conv.id);
          addConversation(conv);
          window.history.replaceState(null, "", `/chat/${conv.id}`);
        } catch {
          return;
        }
      }

      // Add user message
      const userMessage: Message = {
        id: `temp-${Date.now()}`,
        conversationId: currentConvId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
      addMessage(userMessage);
      clearStreaming();

      // Upload files if any
      if (files && files.length > 0) {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("conversation_id", currentConvId);
          try {
            await api.upload("/documents/upload", formData);
          } catch {}
        }
      }

      // Start streaming response
      await startStream(
        `/conversations/${currentConvId}/chat`,
        {
          message: content,
          persona_id: selectedPersonaId,
        },
        {
          onToken: (token: string) => {
            appendStreamingContent(token);
          },
          onSources: (sources: Citation[]) => {
            setStreamingCitations(sources);
          },
          onComplete: (fullContent: string) => {
            const assistantMessage: Message = {
              id: `msg-${Date.now()}`,
              conversationId: currentConvId!,
              role: "assistant",
              content: fullContent,
              citations: useChatStore.getState().streamingCitations,
              createdAt: new Date().toISOString(),
            };
            addMessage(assistantMessage);
            clearStreaming();
          },
          onError: (error: string) => {
            const errorMessage: Message = {
              id: `err-${Date.now()}`,
              conversationId: currentConvId!,
              role: "assistant",
              content: `I apologize, but an error occurred: ${error}. Please try again.`,
              createdAt: new Date().toISOString(),
            };
            addMessage(errorMessage);
            clearStreaming();
          },
        }
      );
    },
    [
      conversationId,
      activeConversationId,
      selectedPersonaId,
      addMessage,
      clearStreaming,
      appendStreamingContent,
      setStreamingCitations,
      startStream,
      setActiveConversation,
      addConversation,
    ]
  );

  const handleRegenerate = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      handleSend(lastUserMsg.content);
    }
  }, [messages, handleSend]);

  // Empty state
  if (!conversationId && !activeConversationId && messages.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="flex items-center justify-center w-14 h-14 rounded-sm bg-primary/10 mb-4">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-2xl font-semibold mb-2">KYRA AI Guardrail</h2>
          <p className="text-muted-foreground text-center max-w-md mb-8">
            Start a conversation with your AI assistant. Ask questions, analyze
            documents, or explore ideas with built-in safety guardrails.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
            {[
              "Explain the latest cybersecurity trends",
              "Help me analyze this security report",
              "What are best practices for API security?",
              "Summarize recent threat intelligence",
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSend(suggestion)}
                className="text-left p-3 rounded-sm border bg-card hover:bg-accent transition-colors text-sm"
              >
                <MessageSquare className="h-4 w-4 text-primary mb-1" />
                {suggestion}
              </button>
            ))}
          </div>
        </div>
        <ChatInput
          onSend={handleSend}
          onStop={stopStream}
          isStreaming={isStreaming}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-4">
          {isLoadingMessages ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {messages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onRegenerate={handleRegenerate}
                />
              ))}
              {/* Streaming message */}
              {streamingMessage && (
                <MessageBubble
                  message={{
                    id: "streaming",
                    conversationId: "",
                    role: "assistant",
                    content: streamingMessage,
                    citations: streamingCitations,
                    createdAt: new Date().toISOString(),
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="max-w-3xl mx-auto w-full">
        <ChatInput
          onSend={handleSend}
          onStop={stopStream}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}
