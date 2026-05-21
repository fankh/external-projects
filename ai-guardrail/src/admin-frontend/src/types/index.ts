export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "admin" | "user" | "viewer";
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  personaId: string;
  purposeId?: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface Message {
  isEdited?: boolean;
  editedAt?: string;
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  createdAt: string;
  feedback?: "positive" | "negative" | null;
}

export interface Persona {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  systemPrompt?: string;
  isDefault?: boolean;
}

export interface Purpose {
  id: string;
  name: string;
  description: string;
  personaId: string;
  guardrails: string[];
}

export interface Document {
  id: string;
  name: string;
  fileName: string;
  fileType: "pdf" | "docx" | "txt" | "md";
  fileSize: number;
  status: "uploading" | "processing" | "indexed" | "failed";
  collectionId?: string;
  uploadedAt: string;
  processedAt?: string;
  chunkCount?: number;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  createdAt: string;
}

export interface Citation {
  id: string;
  documentId: string;
  documentName: string;
  content: string;
  relevanceScore: number;
  pageNumber?: number;
  chunkIndex: number;
}

export interface UsageQuota {
  userId: string;
  dailyQueries: number;
  dailyQueryLimit: number;
  dailyTokens: number;
  dailyTokenLimit: number;
  monthlyQueries: number;
  monthlyQueryLimit: number;
}

export interface SearchResult {
  documentId: string;
  documentName: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface UsageDataPoint {
  date: string;
  queries: number;
  tokens: number;
}

export interface SSEEvent {
  event: "token" | "sources" | "complete" | "error";
  data: string;
}

export interface Bookmark {
  id: string;
  userId: string;
  conversationId: string;
  messageId: string;
  highlightedText: string;
  note: string;
  folderId: string | null;
  tags: string[];
  createdAt: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  bookmarkCount: number;
}

export interface Notification {
  id: string;
  type: "info" | "warning" | "security" | "system";
  title: string;
  message: string;
  status: "unread" | "read";
  metadata: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  progress: number;
  target: number;
  unlockedAt: string | null;
}

export interface UserSettings {
  profile: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
  preferences: {
    theme: "light" | "dark" | "system";
    language: string;
    timezone: string;
  };
  security: {
    mfaEnabled: boolean;
    activeSessions: { id: string; device: string; lastActive: string; current: boolean }[];
  };
  notifications: {
    emailEnabled: boolean;
    pushEnabled: boolean;
    categories: { key: string; label: string; email: boolean; push: boolean }[];
  };
}

export interface FeedbackSubmission {
  messageId: string;
  rating: "positive" | "negative";
  reason: string;
  comment: string;
}
