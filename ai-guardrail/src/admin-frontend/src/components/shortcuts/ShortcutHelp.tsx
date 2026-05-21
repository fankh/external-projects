"use client";

import React, { useState } from "react";
import { Keyboard } from "lucide-react";
import { useShortcut, useShortcutList } from "@/lib/shortcuts";

function fmtCombo(d: { key: string; ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean }) {
  const parts: string[] = [];
  if (d.meta) parts.push("⌘");
  if (d.ctrl) parts.push("Ctrl");
  if (d.alt) parts.push("Alt");
  if (d.shift) parts.push("⇧");
  parts.push(d.key.length === 1 ? d.key.toUpperCase() : d.key);
  return parts.join(" + ");
}

export function ShortcutHelp() {
  const [open, setOpen] = useState(false);
  const shortcuts = useShortcutList();

  // Open the modal on "?" key
  useShortcut({
    key: "?",
    shift: true,
    description: "Open keyboard shortcuts help",
    scope: "global",
    handler: () => setOpen((o) => !o),
  });
  useShortcut({
    key: "escape",
    description: "Close dialogs / shortcut help",
    scope: "global",
    handler: () => setOpen(false),
  });

  if (!open) return null;

  // Group by scope
  const grouped: Record<string, typeof shortcuts> = {};
  for (const s of shortcuts) {
    const k = s.scope || "general";
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(s);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full max-h-[80vh] overflow-auto rounded-sm border border-border bg-card shadow-xl p-6 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Keyboard className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        </div>
        {Object.entries(grouped).map(([scope, items]) => (
          <div key={scope}>
            <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">{scope}</h3>
            <ul className="space-y-1.5">
              {items.map((s, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span>{s.description}</span>
                  <kbd className="font-mono text-xs px-2 py-0.5 rounded-sm bg-muted border border-border">{fmtCombo(s)}</kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="text-xs text-muted-foreground border-t border-border pt-3">Press <kbd className="font-mono px-1 bg-muted rounded-sm border">?</kbd> at any time to toggle this dialog.</p>
      </div>
    </div>
  );
}
