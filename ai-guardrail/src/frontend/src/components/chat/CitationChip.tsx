"use client";

import React, { useState, useRef, useEffect } from "react";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types";

interface CitationChipProps {
  citation: Citation;
  index: number;
}

/**
 * Inline citation chip. Shows [N] in the message text; on hover/click reveals
 * a popover with the source name, page, relevance score, and content snippet.
 */
export function CitationChip({ citation, index }: CitationChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const sevColor = citation.relevanceScore >= 0.8 ? "success"
                 : citation.relevanceScore >= 0.5 ? "warning"
                 : "secondary";

  return (
    <span ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        className={cn(
          "inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 mx-0.5 rounded-sm border text-[10px] font-mono leading-none transition-colors",
          open ? "bg-primary text-primary-foreground border-primary"
               : "bg-muted text-foreground border-border hover:bg-accent"
        )}
        title={citation.documentName}
      >
        {index}
      </button>
      {open && (
        <span
          onMouseLeave={() => setOpen(false)}
          className="absolute z-50 left-0 top-5 w-80 rounded-sm border border-border bg-popover shadow-lg p-3 text-xs space-y-2"
        >
          <span className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="font-semibold flex-1 truncate">{citation.documentName || "(source)"}</span>
            {citation.pageNumber && (
              <span className="text-muted-foreground">p.{citation.pageNumber}</span>
            )}
            <Badge variant={sevColor} className="text-[9px] px-1.5 py-0">
              {Math.round(citation.relevanceScore * 100)}%
            </Badge>
          </span>
          <span className="block text-muted-foreground leading-relaxed line-clamp-6">
            {citation.content}
          </span>
        </span>
      )}
    </span>
  );
}
