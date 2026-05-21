"use client";

import React, { useEffect, useState } from "react";
import {
  MessageSquare,
  FileText,
  Clock,
  MessagesSquare,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AchievementCard } from "@/components/analytics/AchievementCard";
import { api } from "@/lib/api";
import type { Achievement, UsageDataPoint } from "@/types";

// Demo data
const demoAchievements: Achievement[] = [
  {
    id: "1",
    title: "First Query",
    description: "Submit your first query to the AI",
    icon: "MessageSquare",
    progress: 1,
    target: 1,
    unlockedAt: "2026-04-01T10:00:00Z",
  },
  {
    id: "2",
    title: "Power User",
    description: "Submit 100 queries",
    icon: "Zap",
    progress: 42,
    target: 100,
    unlockedAt: null,
  },
  {
    id: "3",
    title: "Document Explorer",
    description: "Upload 10 documents",
    icon: "FileText",
    progress: 7,
    target: 10,
    unlockedAt: null,
  },
  {
    id: "4",
    title: "Persona Master",
    description: "Use 5 different personas",
    icon: "Users",
    progress: 5,
    target: 5,
    unlockedAt: "2026-04-10T14:30:00Z",
  },
  {
    id: "5",
    title: "Bookworm",
    description: "Save 20 bookmarks",
    icon: "Bookmark",
    progress: 3,
    target: 20,
    unlockedAt: null,
  },
  {
    id: "6",
    title: "Streak Champion",
    description: "Use the platform 7 days in a row",
    icon: "Flame",
    progress: 4,
    target: 7,
    unlockedAt: null,
  },
];

const demoPersonas = [
  { name: "General Assistant", count: 25 },
  { name: "Code Review", count: 18 },
  { name: "Security Analyst", count: 12 },
  { name: "Document Summarizer", count: 8 },
  { name: "Compliance Checker", count: 5 },
];

const demoActivity: UsageDataPoint[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toISOString().split("T")[0],
    queries: Math.floor(Math.random() * 30) + 5,
    tokens: Math.floor(Math.random() * 4000) + 500,
  };
});

export default function AnalyticsPage() {
  const [achievements, setAchievements] =
    useState<Achievement[]>(demoAchievements);
  const [activity, setActivity] = useState<UsageDataPoint[]>(demoActivity);
  const [personas, setPersonas] = useState(demoPersonas);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [a, act, p] = await Promise.all([
          api.get<Achievement[]>("/analytics/achievements"),
          api.get<UsageDataPoint[]>("/analytics/activity?days=14"),
          api.get<{ name: string; count: number }[]>("/analytics/personas"),
        ]);
        if (a?.length) setAchievements(a);
        if (act?.length) setActivity(act);
        if (p?.length) setPersonas(p);
      } catch {}
    };
    fetchData();
  }, []);

  const totalQueries = activity.reduce((s, d) => s + d.queries, 0);
  const maxDailyQueries = Math.max(...activity.map((d) => d.queries), 1);
  const maxPersonaCount = Math.max(...personas.map((p) => p.count), 1);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your usage and achievements
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              icon: MessageSquare,
              label: "Total Queries",
              value: totalQueries.toString(),
            },
            {
              icon: FileText,
              label: "Documents Used",
              value: "23",
            },
            {
              icon: Clock,
              label: "Time Saved",
              value: "12.5h",
            },
            {
              icon: MessagesSquare,
              label: "Conversations",
              value: activity.length.toString(),
            },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-sm bg-primary/10 flex items-center justify-center">
                    <stat.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Daily Activity Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-1.5 h-40">
              {activity.map((day) => (
                <div
                  key={day.date}
                  className="flex-1 flex flex-col items-center gap-1"
                >
                  <div
                    className="w-full bg-primary/80 rounded-t transition-all hover:bg-primary"
                    style={{
                      height: `${(day.queries / maxDailyQueries) * 100}%`,
                      minHeight: "4px",
                    }}
                    title={`${day.date}: ${day.queries} queries`}
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {new Date(day.date).getDate()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Personas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top Personas Used</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {personas.map((persona) => (
              <div key={persona.name} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>{persona.name}</span>
                  <span className="text-muted-foreground font-medium">
                    {persona.count}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${(persona.count / maxPersonaCount) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Achievements */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Achievements</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {achievements.map((achievement) => (
              <AchievementCard key={achievement.id} achievement={achievement} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
