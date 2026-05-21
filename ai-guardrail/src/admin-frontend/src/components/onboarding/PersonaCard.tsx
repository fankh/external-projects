"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PersonaCardProps {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onToggle: (id: string) => void;
}

export function PersonaCard({
  id,
  name,
  category,
  description,
  icon,
  selected,
  onToggle,
}: PersonaCardProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={cn(
        "relative flex flex-col items-start gap-3 rounded-sm border p-4 text-left transition-all duration-200 hover:shadow-md",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-muted-foreground/40"
      )}
    >
      {/* Selection indicator */}
      {selected && (
        <div className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-sm bg-primary">
          <Check className="h-3 w-3 text-primary-foreground" />
        </div>
      )}

      {/* Icon */}
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-sm",
          selected
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {icon}
      </div>

      {/* Content */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3
            className={cn(
              "text-sm font-semibold",
              selected ? "text-primary" : "text-foreground"
            )}
          >
            {name}
          </h3>
        </div>
        <span className="inline-block rounded-sm bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {category}
        </span>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      </div>
    </button>
  );
}
