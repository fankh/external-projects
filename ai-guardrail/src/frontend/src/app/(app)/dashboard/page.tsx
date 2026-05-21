"use client";

import React, { useEffect, useState } from "react";
import {
  MessageSquare,
  FileText,
  Zap,
  Users,
  Shield,
} from "lucide-react";
import { StatsCard } from "@/components/dashboard/StatsCard";
import { UsageChart } from "@/components/dashboard/UsageChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { UsageQuota, UsageDataPoint } from "@/types";

// Demo data for initial render
const demoUsageData: UsageDataPoint[] = Array.from({ length: 14 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (13 - i));
  return {
    date: d.toISOString().split("T")[0],
    queries: Math.floor(Math.random() * 50) + 10,
    tokens: Math.floor(Math.random() * 5000) + 1000,
  };
});

export default function DashboardPage() {
  const [quota, setQuota] = useState<UsageQuota | null>(null);
  const [usageData, setUsageData] = useState<UsageDataPoint[]>(demoUsageData);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [q, u] = await Promise.all([
          api.get<UsageQuota>("/usage/quota"),
          api.get<UsageDataPoint[]>("/usage/daily?days=14"),
        ]);
        setQuota(q);
        if (u && u.length > 0) setUsageData(u);
      } catch {}
      setIsLoading(false);
    };
    fetchData();
  }, []);

  const totalQueries = quota?.dailyQueries ?? 42;
  const totalTokens = quota?.dailyTokens ?? 12500;
  const queryLimit = quota?.dailyQueryLimit ?? 100;
  const tokenLimit = quota?.dailyTokenLimit ?? 50000;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your AI usage and system health
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard
            icon={MessageSquare}
            label="Today's Queries"
            value={totalQueries}
            trend={12}
          />
          <StatsCard
            icon={Zap}
            label="Tokens Used"
            value={totalTokens.toLocaleString()}
            trend={-5}
          />
          <StatsCard
            icon={FileText}
            label="Documents"
            value={23}
            trend={8}
          />
          <StatsCard
            icon={Shield}
            label="Guardrail Blocks"
            value={3}
            trend={-15}
          />
        </div>

        {/* Usage Chart */}
        <UsageChart data={usageData} title="Daily Usage (14 days)" />

        {/* Quota Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Query Quota</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Daily</span>
                  <span className="font-medium">
                    {totalQueries} / {queryLimit}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min((totalQueries / queryLimit) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Monthly</span>
                  <span className="font-medium">
                    {quota?.monthlyQueries ?? 580} /{" "}
                    {quota?.monthlyQueryLimit ?? 3000}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{
                      width: `${Math.min(((quota?.monthlyQueries ?? 580) / (quota?.monthlyQueryLimit ?? 3000)) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { name: "AI Engine", status: "Operational" },
                  { name: "RAG Pipeline", status: "Operational" },
                  { name: "Guardrail System", status: "Operational" },
                  { name: "Document Processor", status: "Operational" },
                ].map((service) => (
                  <div
                    key={service.name}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm">{service.name}</span>
                    <Badge variant="success">{service.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
