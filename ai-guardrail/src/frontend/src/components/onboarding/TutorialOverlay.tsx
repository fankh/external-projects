"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface TutorialStep {
  target: string;       // CSS selector for the element to highlight
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right";
}

const DEFAULT_STEPS: TutorialStep[] = [
  { target: "[data-tutorial='sidebar']", title: "Sidebar", content: "Navigate between Chat, Documents, Dashboard, and more. Collapse it with the arrow button.", position: "right" },
  { target: "[data-tutorial='new-chat']", title: "New conversation", content: "Click here or press Shift+N to start a new chat.", position: "right" },
  { target: "[data-tutorial='persona']", title: "AI Persona", content: "Select a specialized persona (Security, Legal, Engineering, etc.) for domain-specific responses.", position: "right" },
  { target: "[data-tutorial='search']", title: "Search", content: "Search across all your conversations. Press / to focus instantly.", position: "bottom" },
  { target: "[data-tutorial='chat-input']", title: "Chat input", content: "Type your message and press Enter. Attach files with the paperclip icon. Drafts auto-save.", position: "top" },
  { target: "[data-tutorial='admin']", title: "Admin Console", content: "Manage users, compliance (GDPR/HIPAA/SOC2), SSO, billing, and connectors — all from here.", position: "bottom" },
];

interface TutorialOverlayProps {
  steps?: TutorialStep[];
  onComplete?: () => void;
}

export function TutorialOverlay({ steps = DEFAULT_STEPS, onComplete }: TutorialOverlayProps) {
  const STORAGE_KEY = "kyra:tutorial:completed";
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  // Show on first visit only
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(STORAGE_KEY)) {
      const t = setTimeout(() => setActive(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const updateRect = useCallback(() => {
    if (!active || step >= steps.length) return;
    const el = document.querySelector(steps[step].target);
    if (el) setTargetRect(el.getBoundingClientRect());
    else setTargetRect(null);
  }, [active, step, steps]);

  useEffect(() => {
    updateRect();
    window.addEventListener("resize", updateRect);
    return () => window.removeEventListener("resize", updateRect);
  }, [updateRect]);

  const close = () => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "true");
    onComplete?.();
  };

  const next = () => {
    if (step >= steps.length - 1) { close(); return; }
    setStep(step + 1);
  };
  const prev = () => setStep(Math.max(0, step - 1));

  if (!active || step >= steps.length) return null;

  const s = steps[step];
  const pos = s.position || "bottom";

  // Calculate tooltip position relative to target
  let tooltipStyle: React.CSSProperties = { position: "fixed", zIndex: 10001, maxWidth: 340 };
  if (targetRect) {
    if (pos === "bottom") { tooltipStyle.top = targetRect.bottom + 12; tooltipStyle.left = targetRect.left; }
    else if (pos === "top") { tooltipStyle.bottom = window.innerHeight - targetRect.top + 12; tooltipStyle.left = targetRect.left; }
    else if (pos === "right") { tooltipStyle.top = targetRect.top; tooltipStyle.left = targetRect.right + 12; }
    else { tooltipStyle.top = targetRect.top; tooltipStyle.right = window.innerWidth - targetRect.left + 12; }
  } else {
    tooltipStyle.top = "50%"; tooltipStyle.left = "50%"; tooltipStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[10000] bg-black/40" onClick={close} />

      {/* Highlight cutout — simple white border ring on the target */}
      {targetRect && (
        <div className="fixed z-[10000] border-2 border-primary rounded-sm pointer-events-none transition-all duration-300"
             style={{ top: targetRect.top - 4, left: targetRect.left - 4,
                      width: targetRect.width + 8, height: targetRect.height + 8 }} />
      )}

      {/* Tooltip card */}
      <div style={tooltipStyle} className="rounded-sm border border-border bg-card shadow-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{s.title}</h3>
          <button onClick={close} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{s.content}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">{step + 1} / {steps.length}</span>
          <div className="flex gap-2">
            {step > 0 && <Button size="sm" variant="ghost" onClick={prev}><ChevronLeft className="h-3 w-3 mr-1" />Back</Button>}
            <Button size="sm" onClick={next}>
              {step === steps.length - 1 ? <><CheckCircle className="h-3 w-3 mr-1" />Done</> : <>Next<ChevronRight className="h-3 w-3 ml-1" /></>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
