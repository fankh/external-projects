"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  Plus,
  PieChart,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { StatCard } from "@/components/admin/StatCard";
import { SecurityEventTable } from "@/components/admin/SecurityEventTable";
import { DlpPatternTable } from "@/components/admin/DlpPatternTable";
import { useAdminStore, type DlpPattern } from "@/stores/admin-store";

export default function SecurityPage() {
  const {
    securityEvents,
    eventsLoading,
    fetchSecurityEvents,
    reviewEvent,
    dlpPatterns,
    patternsLoading,
    fetchDlpPatterns,
    togglePattern,
    createPattern,
    users,
    fetchUsers,
  } = useAdminStore();

  const [showAddPattern, setShowAddPattern] = useState(false);
  const [newPattern, setNewPattern] = useState({
    name: "",
    category: "",
    pattern: "",
    severity: "medium" as DlpPattern["severity"],
    action: "warn" as DlpPattern["action"],
    active: true,
  });

  useEffect(() => {
    fetchSecurityEvents();
    fetchDlpPatterns();
    fetchUsers();
  }, [fetchSecurityEvents, fetchDlpPatterns, fetchUsers]);

  // Stats
  const riskDistribution = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    securityEvents.forEach((e) => {
      counts[e.severity]++;
    });
    return counts;
  }, [securityEvents]);

  const eventsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    securityEvents.forEach((e) => {
      counts[e.type] = (counts[e.type] || 0) + 1;
    });
    return counts;
  }, [securityEvents]);

  const activeThreats = securityEvents.filter((e) => e.status === "open").length;

  // High-risk users: users with multiple security events
  const highRiskUsers = useMemo(() => {
    const userEventCount: Record<string, { name: string; count: number }> = {};
    securityEvents
      .filter((e) => e.status === "open")
      .forEach((e) => {
        if (!userEventCount[e.userId]) {
          userEventCount[e.userId] = { name: e.userName, count: 0 };
        }
        userEventCount[e.userId].count++;
      });
    return Object.entries(userEventCount)
      .map(([id, data]) => ({
        userId: id,
        name: data.name,
        riskScore: Math.min(data.count * 25, 100),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 5);
  }, [securityEvents]);

  function handleCreatePattern() {
    if (newPattern.name && newPattern.pattern) {
      createPattern(newPattern);
      setShowAddPattern(false);
      setNewPattern({
        name: "",
        category: "",
        pattern: "",
        severity: "medium",
        action: "warn",
        active: true,
      });
    }
  }

  function handleEditPattern(pattern: DlpPattern) {
    // Placeholder for edit functionality
    alert(`Edit pattern: ${pattern.name}`);
  }

  const typeLabels: Record<string, string> = {
    dlp_violation: "DLP Violations",
    auth_failure: "Auth Failures",
    anomaly: "Anomalies",
    policy_breach: "Policy Breaches",
    data_exfil: "Data Exfiltration",
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Risk Score Distribution (pie chart placeholder) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChart className="h-5 w-5 text-muted-foreground" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 flex-wrap">
              {Object.entries(riskDistribution).map(([level, count]) => {
                const colors: Record<string, string> = {
                  critical: "bg-destructive",
                  high: "bg-orange-500",
                  medium: "bg-[hsl(var(--warning))]",
                  low: "bg-[hsl(var(--info))]",
                };
                return (
                  <div key={level} className="flex items-center gap-2">
                    <div className={`h-3 w-3 rounded-full ${colors[level]}`} />
                    <span className="text-sm capitalize">{level}</span>
                    <span className="text-sm font-bold">{count}</span>
                  </div>
                );
              })}
            </div>
            {/* Simple bar representation */}
            <div className="flex h-4 rounded-full overflow-hidden mt-3 bg-muted">
              {Object.entries(riskDistribution).map(([level, count]) => {
                const total = Object.values(riskDistribution).reduce((a, b) => a + b, 0);
                if (total === 0 || count === 0) return null;
                const colors: Record<string, string> = {
                  critical: "bg-destructive",
                  high: "bg-orange-500",
                  medium: "bg-[hsl(var(--warning))]",
                  low: "bg-[hsl(var(--info))]",
                };
                return (
                  <div
                    key={level}
                    className={`h-full ${colors[level]}`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Events by Type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Events by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(eventsByType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {typeLabels[type] ?? type}
                  </span>
                  <Badge variant="outline">{count}</Badge>
                </div>
              ))}
              {Object.keys(eventsByType).length === 0 && (
                <p className="text-sm text-muted-foreground">No events</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Active Threats */}
        <StatCard
          icon={AlertTriangle}
          label="Active Threats"
          value={activeThreats}
          variant={activeThreats > 3 ? "danger" : activeThreats > 0 ? "warning" : "success"}
          description={activeThreats > 0 ? "Requires attention" : "All clear"}
        />
      </div>

      {/* DLP Patterns */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">DLP Patterns</CardTitle>
          <Button size="sm" className="gap-2" onClick={() => setShowAddPattern(true)}>
            <Plus className="h-4 w-4" /> Add Pattern
          </Button>
        </CardHeader>
        <CardContent>
          <DlpPatternTable
            patterns={dlpPatterns}
            onToggle={togglePattern}
            onEdit={handleEditPattern}
            loading={patternsLoading}
          />
        </CardContent>
      </Card>

      {/* Recent Security Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Recent Security Events
          </CardTitle>
        </CardHeader>
        <CardContent>
          <SecurityEventTable
            events={securityEvents}
            onReview={reviewEvent}
            loading={eventsLoading}
          />
        </CardContent>
      </Card>

      {/* High-Risk Users */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">High-Risk Users</CardTitle>
        </CardHeader>
        <CardContent>
          {highRiskUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No high-risk users detected
            </p>
          ) : (
            <div className="space-y-4">
              {highRiskUsers.map((user) => (
                <div key={user.userId} className="flex items-center gap-4">
                  <div className="w-32 text-sm font-medium truncate">{user.name}</div>
                  <div className="flex-1">
                    <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          user.riskScore >= 75
                            ? "bg-destructive"
                            : user.riskScore >= 50
                            ? "bg-orange-500"
                            : "bg-[hsl(var(--warning))]"
                        }`}
                        style={{ width: `${user.riskScore}%` }}
                      />
                    </div>
                  </div>
                  <div className="w-16 text-right text-sm font-medium">
                    {user.riskScore}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Pattern Dialog */}
      <Dialog open={showAddPattern} onOpenChange={setShowAddPattern}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add DLP Pattern</DialogTitle>
            <DialogDescription>
              Create a new data loss prevention pattern to detect sensitive data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Pattern Name</label>
              <Input
                placeholder="e.g., Credit Card Numbers"
                value={newPattern.name}
                onChange={(e) => setNewPattern((p) => ({ ...p, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Category</label>
              <select
                value={newPattern.category}
                onChange={(e) => setNewPattern((p) => ({ ...p, category: e.target.value }))}
                className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
              >
                <option value="">Select category</option>
                <option value="PII">PII</option>
                <option value="Contact">Contact</option>
                <option value="Business">Business</option>
                <option value="Secrets">Secrets</option>
                <option value="Financial">Financial</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Regex Pattern</label>
              <Input
                placeholder="e.g., \b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b"
                value={newPattern.pattern}
                onChange={(e) => setNewPattern((p) => ({ ...p, pattern: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Severity</label>
                <select
                  value={newPattern.severity}
                  onChange={(e) =>
                    setNewPattern((p) => ({
                      ...p,
                      severity: e.target.value as DlpPattern["severity"],
                    }))
                  }
                  className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Action</label>
                <select
                  value={newPattern.action}
                  onChange={(e) =>
                    setNewPattern((p) => ({
                      ...p,
                      action: e.target.value as DlpPattern["action"],
                    }))
                  }
                  className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
                >
                  <option value="block">Block</option>
                  <option value="warn">Warn</option>
                  <option value="log">Log</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPattern(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePattern}>Create Pattern</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
