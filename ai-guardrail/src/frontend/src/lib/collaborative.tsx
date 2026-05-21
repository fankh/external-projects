"use client";

/**
 * Collaborative editing scaffold using Yjs CRDT.
 *
 * Architecture:
 *   - Each document/conversation is a Y.Doc
 *   - Changes sync via WebSocket to a y-websocket provider server
 *   - Presence (cursor positions, selections) via awareness protocol
 *
 * To activate:
 *   1. npm install yjs y-websocket
 *   2. Run y-websocket server: npx y-websocket --port 4444
 *   3. Connect docs via useCollaborativeDoc(roomName)
 *
 * This file provides the hooks; actual integration into chat/documents
 * is deferred until the y-websocket server is deployed.
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";

// Types (Yjs is not installed yet — these are interface stubs)
interface YDoc {
  getText(name: string): YText;
  getMap(name: string): YMap;
  destroy(): void;
}

interface YText {
  toString(): string;
  insert(index: number, text: string): void;
  delete(index: number, length: number): void;
  observe(fn: (event: unknown) => void): void;
}

interface YMap {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  observe(fn: (event: unknown) => void): void;
}

interface Awareness {
  setLocalState(state: Record<string, unknown>): void;
  getStates(): Map<number, Record<string, unknown>>;
  on(event: string, fn: (...args: unknown[]) => void): void;
}

interface CollaborativeState {
  connected: boolean;
  doc: YDoc | null;
  awareness: Awareness | null;
  peers: { clientId: number; name: string; color: string; cursor?: number }[];
}

const CollaborativeContext = createContext<CollaborativeState | null>(null);

export function useCollaborativeDoc(roomName: string, userName: string) {
  const [state, setState] = useState<CollaborativeState>({
    connected: false, doc: null, awareness: null, peers: [],
  });

  useEffect(() => {
    // Stub: in production, this creates a Y.Doc + WebsocketProvider
    // import * as Y from "yjs";
    // import { WebsocketProvider } from "y-websocket";
    // const doc = new Y.Doc();
    // const provider = new WebsocketProvider("ws://localhost:4444", roomName, doc);
    // provider.awareness.setLocalState({ name: userName, color: "#" + Math.floor(Math.random()*16777215).toString(16) });
    //
    // For now, just mark as not connected (no y-websocket server)
    setState(prev => ({ ...prev, connected: false }));

    return () => {
      // doc.destroy(); provider.disconnect();
    };
  }, [roomName, userName]);

  return state;
}

/**
 * Hook for awareness (who else is in this document/conversation).
 * Returns list of peer cursors for rendering colored indicators.
 */
export function usePeers(awareness: Awareness | null) {
  const [peers, setPeers] = useState<{ clientId: number; name: string; color: string }[]>([]);

  useEffect(() => {
    if (!awareness) return;
    const update = () => {
      const states = awareness.getStates();
      const result: typeof peers = [];
      states.forEach((state, clientId) => {
        if (state.name) {
          result.push({ clientId, name: state.name as string, color: (state.color as string) || "#999" });
        }
      });
      setPeers(result);
    };
    awareness.on("change", update);
    update();
  }, [awareness]);

  return peers;
}

export { CollaborativeContext };
