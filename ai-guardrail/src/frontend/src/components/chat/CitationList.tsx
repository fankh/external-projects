"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronUp, FileText, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CitationChip } from "./CitationChip";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types";

interface CitationListProps {
  citations: Citation[];
}

export function CitationList({ citations }: CitationListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-2">
      {/* Inline chips so users can hover to peek at any source */}
      <div className="flex flex-wrap gap-1 mb-2">
        {citations.map((c, idx) => (
          <CitationChip key={c.id || idx} citation={c} index={idx + 1} />
        ))}
      </div>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="h-3 w-3" />
        <span className="font-medium">
          {citations.length} source{citations.length !== 1 ? "s" : ""}
        </span>
        {isExpanded ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-2 space-y-2">
          {citations.map((citation, idx) => (
            <div
              key={citation.id || idx}
              className="rounded-sm border bg-muted/30 p-3 text-sm"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-xs">
                    {citation.documentName}
                  </span>
                  {citation.pageNumber && (
                    <span className="text-xs text-muted-foreground">
                      p. {citation.pageNumber}
                    </span>
                  )}
                </div>
                <Badge
                  variant={
                    citation.relevanceScore >= 0.8
                      ? "success"
                      : citation.relevanceScore >= 0.5
                        ? "warning"
                        : "secondary"
                  }
                  className="text-[10px] px-1.5 py-0"
                >
                  {Math.round(citation.relevanceScore * 100)}%
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                {citation.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
