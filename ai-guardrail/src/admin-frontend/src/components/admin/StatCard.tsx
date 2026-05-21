"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ColorVariant = "default" | "success" | "warning" | "danger" | "info";

const accent: Record<ColorVariant, string> = {
  default: "bg-primary",
  success: "bg-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]",
  danger: "bg-destructive",
  info: "bg-[hsl(var(--info))]",
};

const iconTint: Record<ColorVariant, string> = {
  default: "bg-primary/10 text-primary",
  success: "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]",
  warning: "bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]",
  danger: "bg-destructive/10 text-destructive",
  info: "bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]",
};

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  description?: string;
  variant?: ColorVariant;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, description, variant = "default", className }: StatCardProps) {
  return (
    <Card hoverable className={cn("relative overflow-hidden", className)}>
      <div className={cn("absolute left-0 top-0 bottom-0 w-1", accent[variant])} />
      <CardContent className="p-5 pl-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className={cn("flex items-center justify-center h-9 w-9 rounded-sm", iconTint[variant])}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
