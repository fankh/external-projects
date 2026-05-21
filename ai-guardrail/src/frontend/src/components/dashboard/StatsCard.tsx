"use client";

import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  trend?: number;
  className?: string;
}

export function StatsCard({ icon: Icon, label, value, trend, className }: StatsCardProps) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <Card hoverable className={cn("relative overflow-hidden", className)}>
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
      <CardContent className="p-5 pl-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {label}
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value}</p>
          </div>
          <div className="flex items-center justify-center h-9 w-9 rounded-sm bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
        </div>
        {trend !== undefined && (
          <div
            className={cn(
              "mt-3 inline-flex items-center gap-1 text-xs font-medium",
              isPositive
                ? "text-[hsl(var(--success))]"
                : "text-[hsl(var(--destructive))]"
            )}
          >
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(trend)}% vs. last period
          </div>
        )}
      </CardContent>
    </Card>
  );
}
