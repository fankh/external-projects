"use client";

import React, { useRef, useCallback, useState } from "react";
import { Send, Paperclip, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string, files?: File[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}: ChatInputProps) {
  const DRAFT_KEY = "chat:draft:current";
  const [value, setValue] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(DRAFT_KEY) || "";
  });
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [recovered, setRecovered] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!localStorage.getItem(DRAFT_KEY);
  });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosave (debounced)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const t = setTimeout(() => {
      if (value.trim().length > 0) {
        localStorage.setItem(DRAFT_KEY, value);
      } else {
        localStorage.removeItem(DRAFT_KEY);
        setRecovered(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [value]);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed && attachedFiles.length === 0) return;
    onSend(trimmed, attachedFiles.length > 0 ? attachedFiles : undefined);
    setValue("");
    setAttachedFiles([]);
    setRecovered(false);
    if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, attachedFiles, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming && !disabled) {
          handleSend();
        }
      }
    },
    [handleSend, isStreaming, disabled]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachedFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const discardDraft = () => {
    setValue("");
    setRecovered(false);
    if (typeof window !== "undefined") localStorage.removeItem(DRAFT_KEY);
  };

  return (
    <div className="border-t bg-card p-4">
      {recovered && value.trim().length > 0 && (
        <div className="mb-2 flex items-center justify-between rounded-sm border border-border bg-muted px-3 py-1.5 text-xs">
          <span className="text-muted-foreground">Recovered draft from last session</span>
          <button onClick={discardDraft} className="text-destructive hover:underline">Discard</button>
        </div>
      )}
      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {attachedFiles.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 bg-muted rounded-sm px-2.5 py-1 text-xs"
            >
              <Paperclip className="h-3 w-3" />
              <span className="max-w-[150px] truncate">{file.name}</span>
              <button
                onClick={() => removeFile(idx)}
                className="ml-1 text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File attach */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          accept=".pdf,.docx,.doc,.txt,.md"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
        >
          <Paperclip className="h-4 w-4" />
        </Button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Shift+Enter for new line)" aria-label="Type a message"
          className="flex-1 resize-none rounded-sm border border-input bg-background px-3 py-2.5 text-sm transition-colors placeholder:text-muted-foreground hover:border-[hsl(var(--input-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:border-[hsl(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px] max-h-[200px]"
          rows={1}
          disabled={disabled}
        />

        {/* Send / Stop */}
        {isStreaming ? (
          <Button
            variant="destructive"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onStop}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={handleSend}
            disabled={disabled || (!value.trim() && attachedFiles.length === 0)}
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
