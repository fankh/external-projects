"use client";

import React from "react";
import {
  ShieldAlert,
  KeyRound,
  AlertTriangle,
  FileWarning,
  Database,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SecurityEvent } from "@/stores/admin-store";

const severityVariant: Record<string, "destructive" | "warning" | "info" | "secondary"> = {
  critical: "destructive",
  high: "warning",
  medium: "info",
  low: "secondary",
};

const typeIcons: Record<string, React.ElementType> = {
  dlp_violation: ShieldAlert,
  auth_failure: KeyRound,
  anomaly: AlertTriangle,
  policy_breach: FileWarning,
  data_exfil: Database,
};

const typeLabels: Record<string, string> = {
  dlp_violation: "DLP Violation",
  auth_failure: "Auth Failure",
  anomaly: "Anomaly",
  policy_breach: "Policy Breach",
  data_exfil: "Data Exfiltration",
};

interface SecurityEventTableProps {
  events: SecurityEvent[];
  onReview: (eventId: string) => void;
  loading?: boolean;
}

export function SecurityEventTable({ events, onReview, loading }: SecurityEventTableProps) {
  function formatTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th>Severity</th>
            <th>Type</th>
            <th>User</th>
            <th>Description</th>
            <th>Time</th>
            <th>Status</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const TypeIcon = typeIcons[event.type] ?? AlertTriangle;
            return (
              <tr key={event.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="py-3">
                  <Badge variant={severityVariant[event.severity] ?? "secondary"}>
                    {event.severity}
                  </Badge>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <TypeIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{typeLabels[event.type] ?? event.type}</span>
                  </div>
                </td>
                <td className="py-3 text-muted-foreground">{event.userName}</td>
                <td className="py-3 max-w-xs truncate text-muted-foreground">{event.description}</td>
                <td className="py-3 text-muted-foreground whitespace-nowrap">{formatTime(event.createdAt)}</td>
                <td className="py-3">
                  <Badge variant={event.status === "open" ? "warning" : event.status === "reviewed" ? "success" : "secondary"}>
                    {event.status}
                  </Badge>
                </td>
                <td className="py-3 text-right">
                  {event.status === "open" && (
                    <Button variant="ghost" size="sm" onClick={() => onReview(event.id)}>
                      <Eye className="h-4 w-4 mr-1" /> Review
                    </Button>
                  )}
                </td>
              </tr>
            );
          })}
          {events.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted-foreground">
                No security events found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
