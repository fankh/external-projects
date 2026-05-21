"use client";

import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  Copy,
  Check,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Bot,
  User,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CitationList } from "./CitationList";
import { cn } from "@/lib/utils";
import type { Message } from "@/types";
import { useChatStore } from "@/stores/chat-store";
import { api } from "@/lib/api";

interface MessageBubbleProps {
  message: Message;
  onRegenerate?: () => void;
}

export function MessageBubble({ message, onRegenerate }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const { updateMessageFeedback } = useChatStore();
  const isUser = message.role === "user";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const saveEdit = async () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) { setIsEditing(false); return; }
    try {
      await api.put(`/conversations/messages/${message.id}`, { content: trimmed });
      message.content = trimmed;
      setIsEditing(false);
    } catch (err) {
      console.error("Edit failed", err);
    }
  };

  const handleFeedback = async (feedback: "positive" | "negative") => {
    const newFeedback = message.feedback === feedback ? null : feedback;
    updateMessageFeedback(message.id, newFeedback);
    try {
      await api.post(`/messages/${message.id}/feedback`, {
        feedback: newFeedback,
      });
    } catch {}
  };

  return (
    <div
      role="article"
      aria-label={isUser ? "Your message" : "Assistant response"}
      className={cn(
        "flex gap-3 px-4 py-3 group",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 shrink-0 mt-0.5 rounded-sm">
        <AvatarFallback
          className={cn(
            "text-xs",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          )}
        >
          {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div
        className={cn("flex flex-col max-w-[75%]", isUser && "items-end")}
      >
        <div
          className={cn(
            "rounded-sm px-4 py-3 text-sm leading-relaxed border",
            isUser
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-card text-card-foreground border-border"
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown
                components={{
                  code: ({ className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || "");
                    const isInline = !match;
                    return isInline ? (
                      <code
                        className="bg-background/20 px-1 py-0.5 rounded text-xs font-mono"
                        {...props}
                      >
                        {children}
                      </code>
                    ) : (
                      <div className="relative mt-2 mb-2">
                        <div className="flex items-center justify-between bg-background/10 px-3 py-1 rounded-t-md text-xs">
                          <span>{match[1]}</span>
                          <button
                            onClick={handleCopy}
                            className="opacity-50 hover:opacity-100"
                          >
                            {copied ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                        <pre className="rounded-t-none rounded-b-md bg-background/10 p-3 overflow-x-auto">
                          <code className="text-xs font-mono" {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    );
                  },
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  ul: ({ children }) => (
                    <ul className="list-disc pl-4 mb-2">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="list-decimal pl-4 mb-2">{children}</ol>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Citations */}
        {!isUser && message.citations && (
          <CitationList citations={message.citations} />
        )}

        {/* Actions */}
        <div
          className={cn(
            "flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity",
            isUser ? "flex-row-reverse" : "flex-row"
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
            title="Copy"
          >
            {copied ? (
              <Check className="h-3 w-3" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </Button>

          {isUser && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsEditing(true)}
              title="Edit"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}

          {!isUser && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onRegenerate}
                title="Regenerate"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  message.feedback === "positive" && "text-[hsl(var(--success))]"
                )}
                onClick={() => handleFeedback("positive")}
                title="Good response"
              >
                <ThumbsUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7",
                  message.feedback === "negative" && "text-destructive"
                )}
                onClick={() => handleFeedback("negative")}
                title="Bad response"
              >
                <ThumbsDown className="h-3 w-3" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
