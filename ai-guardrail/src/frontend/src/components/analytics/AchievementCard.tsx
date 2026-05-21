"use client";

import React from "react";
import {
  MessageSquare,
  Zap,
  FileText,
  Users,
  Bookmark,
  Flame,
  Trophy,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Achievement } from "@/types";

const iconMap: Record<string, React.ElementType> = {
  MessageSquare,
  Zap,
  FileText,
  Users,
  Bookmark,
  Flame,
  Trophy,
};

interface AchievementCardProps {
  achievement: Achievement;
}

export function AchievementCard({ achievement }: AchievementCardProps) {
  const isUnlocked = achievement.unlockedAt !== null;
  const progress = Math.min(
    (achievement.progress / achievement.target) * 100,
    100
  );
  const Icon = iconMap[achievement.icon] || Trophy;

  return (
    <Card
      className={cn(
        "transition-all",
        !isUnlocked && "opacity-60"
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "h-10 w-10 rounded-sm flex items-center justify-center shrink-0",
              isUnlocked
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
            )}
          >
            {isUnlocked ? (
              <Icon className="h-5 w-5" />
            ) : (
              <Lock className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <p
              className={cn(
                "text-sm font-semibold",
                !isUnlocked && "text-muted-foreground"
              )}
            >
              {achievement.title}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {achievement.description}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">
              {achievement.progress} / {achievement.target}
            </span>
            <span className="font-medium">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isUnlocked ? "bg-primary" : "bg-muted-foreground/40"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Unlocked date */}
        {isUnlocked && achievement.unlockedAt && (
          <p className="text-[10px] text-muted-foreground">
            Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
