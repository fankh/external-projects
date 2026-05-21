"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";

export type ShortcutHandler = (e: KeyboardEvent) => void;

export interface ShortcutDefinition {
  key: string;          // canonical key (lowercase, e.g. "k", "/", "?", "escape")
  ctrl?: boolean;
  meta?: boolean;       // ⌘ on macOS
  shift?: boolean;
  alt?: boolean;
  description: string;
  handler: ShortcutHandler;
  scope?: string;       // optional grouping label for the help modal
}

interface ShortcutContextType {
  register: (def: ShortcutDefinition) => () => void;
  list: () => ShortcutDefinition[];
}

const ShortcutContext = createContext<ShortcutContextType | null>(null);

function matchesEvent(def: ShortcutDefinition, e: KeyboardEvent): boolean {
  const k = e.key.toLowerCase();
  if (k !== def.key.toLowerCase()) return false;
  if (!!def.ctrl !== !!e.ctrlKey) return false;
  if (!!def.meta !== !!e.metaKey) return false;
  if (!!def.shift !== !!e.shiftKey) return false;
  if (!!def.alt !== !!e.altKey) return false;
  return true;
}

export function ShortcutProvider({ children }: { children: React.ReactNode }) {
  const handlers = useRef<ShortcutDefinition[]>([]);

  const register = useCallback((def: ShortcutDefinition) => {
    handlers.current.push(def);
    return () => {
      handlers.current = handlers.current.filter((d) => d !== def);
    };
  }, []);

  const list = useCallback(() => [...handlers.current], []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Skip when typing in inputs/textareas (unless modifier present)
      const target = e.target as HTMLElement | null;
      const inField = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      const hasMod = e.ctrlKey || e.metaKey || e.altKey;
      if (inField && !hasMod && e.key !== "Escape") return;

      for (const def of handlers.current) {
        if (matchesEvent(def, e)) {
          e.preventDefault();
          def.handler(e);
          return;
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo(() => ({ register, list }), [register, list]);
  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}

export function useShortcut(def: ShortcutDefinition) {
  const ctx = useContext(ShortcutContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.register(def);
    // we intentionally re-register on every render so closures stay fresh
  });
}

export function useShortcutList() {
  const ctx = useContext(ShortcutContext);
  return ctx ? ctx.list() : [];
}
