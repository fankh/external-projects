import { create } from "zustand";
import type { Conversation, Message, Citation } from "@/types";

interface ChatState {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  streamingMessage: string;
  streamingCitations: Citation[];
  selectedPersonaId: string;
  isLoadingMessages: boolean;

  setConversations: (conversations: Conversation[]) => void;
  addConversation: (conversation: Conversation) => void;
  setActiveConversation: (id: string | null) => void;
  setMessages: (messages: Message[]) => void;
  addMessage: (message: Message) => void;
  appendStreamingContent: (token: string) => void;
  setStreamingCitations: (citations: Citation[]) => void;
  clearStreaming: () => void;
  setSelectedPersonaId: (id: string) => void;
  setIsLoadingMessages: (loading: boolean) => void;
  updateMessageFeedback: (messageId: string, feedback: "positive" | "negative" | null) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  streamingMessage: "",
  streamingCitations: [],
  selectedPersonaId: "default",
  isLoadingMessages: false,

  setConversations: (conversations) => set({ conversations }),

  addConversation: (conversation) =>
    set((state) => ({
      conversations: [conversation, ...state.conversations],
    })),

  setActiveConversation: (id) =>
    set({ activeConversationId: id, messages: [], streamingMessage: "" }),

  setMessages: (messages) => set({ messages }),

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  appendStreamingContent: (token) =>
    set((state) => ({
      streamingMessage: state.streamingMessage + token,
    })),

  setStreamingCitations: (citations) => set({ streamingCitations: citations }),

  clearStreaming: () => set({ streamingMessage: "", streamingCitations: [] }),

  setSelectedPersonaId: (id) => set({ selectedPersonaId: id }),

  setIsLoadingMessages: (loading) => set({ isLoadingMessages: loading }),

  updateMessageFeedback: (messageId, feedback) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, feedback } : m
      ),
    })),
}));
