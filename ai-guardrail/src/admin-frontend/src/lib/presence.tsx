"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface PresenceState {
  typingUsers: Map<string, { userId: string; name: string; timestamp: number }>;
  setTyping: (conversationId: string, userId: string, name: string, isTyping: boolean) => void;
  getTyping: (conversationId: string) => { userId: string; name: string }[];
}

const PresenceContext = createContext<PresenceState | null>(null);

export function PresenceProvider({ children }: { children: React.ReactNode }) {
  const [typingUsers, setTypingUsers] = useState<Map<string, { userId: string; name: string; timestamp: number }>>(new Map());

  // Auto-clear stale typing indicators (>5s)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => {
        const next = new Map(prev);
        let changed = false;
        for (const [key, val] of next) {
          if (now - val.timestamp > 5000) {
            next.delete(key);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const setTyping = useCallback((conversationId: string, userId: string, name: string, isTyping: boolean) => {
    const key = `${conversationId}:${userId}`;
    setTypingUsers(prev => {
      const next = new Map(prev);
      if (isTyping) {
        next.set(key, { userId, name, timestamp: Date.now() });
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const getTyping = useCallback((conversationId: string) => {
    const result: { userId: string; name: string }[] = [];
    for (const [key, val] of typingUsers) {
      if (key.startsWith(conversationId + ":")) {
        result.push({ userId: val.userId, name: val.name });
      }
    }
    return result;
  }, [typingUsers]);

  return (
    <PresenceContext.Provider value={{ typingUsers, setTyping, getTyping }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresence() {
  return useContext(PresenceContext);
}

export function TypingIndicator({ conversationId }: { conversationId: string }) {
  const ctx = usePresence();
  if (!ctx) return null;
  const typing = ctx.getTyping(conversationId);
  if (typing.length === 0) return null;
  const names = typing.map(t => t.name).join(", ");
  return (
    <div className="px-4 py-1 text-xs text-muted-foreground animate-pulse">
      {names} {typing.length === 1 ? "is" : "are"} typing...
    </div>
  );
}
