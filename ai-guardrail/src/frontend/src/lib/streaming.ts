"use client";

import { useCallback, useRef, useState } from "react";
import { api } from "./api";
import type { Citation } from "@/types";

interface StreamingOptions {
  onToken: (token: string) => void;
  onSources: (sources: Citation[]) => void;
  onComplete: (fullContent: string) => void;
  onError: (error: string) => void;
}

interface StreamingState {
  isStreaming: boolean;
  error: string | null;
}

export function useStreaming() {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    error: null,
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    async (
      path: string,
      body: Record<string, unknown>,
      options: StreamingOptions
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setState({ isStreaming: true, error: null });

      try {
        const url = api.getStreamUrl(path);
        const token = api.getToken();

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({
            detail: response.statusText,
          }));
          throw new Error(err.detail || `Stream failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("event: ")) {
              const eventType = line.slice(7).trim();
              continue;
            }

            if (line.startsWith("data: ")) {
              const rawData = line.slice(6);

              // Try to parse as JSON first
              try {
                const parsed = JSON.parse(rawData);

                if (parsed.event === "token" || parsed.type === "token") {
                  const tokenText = parsed.data || parsed.content || "";
                  fullContent += tokenText;
                  options.onToken(tokenText);
                } else if (parsed.event === "sources" || parsed.type === "sources") {
                  const sources = parsed.data || parsed.sources || [];
                  options.onSources(sources);
                } else if (parsed.event === "complete" || parsed.type === "complete") {
                  options.onComplete(fullContent);
                } else if (parsed.event === "error" || parsed.type === "error") {
                  options.onError(parsed.data || parsed.message || "Stream error");
                } else if (typeof parsed === "string") {
                  fullContent += parsed;
                  options.onToken(parsed);
                }
              } catch {
                // Not JSON, treat as plain token text
                if (rawData && rawData !== "[DONE]") {
                  fullContent += rawData;
                  options.onToken(rawData);
                }
              }
            }
          }
        }

        // If we never got a complete event, call it now
        if (fullContent) {
          options.onComplete(fullContent);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const message = (err as Error).message || "Streaming failed";
        setState((s) => ({ ...s, error: message }));
        options.onError(message);
      } finally {
        setState((s) => ({ ...s, isStreaming: false }));
        abortControllerRef.current = null;
      }
    },
    []
  );

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setState({ isStreaming: false, error: null });
    }
  }, []);

  return {
    isStreaming: state.isStreaming,
    error: state.error,
    startStream,
    stopStream,
  };
}
