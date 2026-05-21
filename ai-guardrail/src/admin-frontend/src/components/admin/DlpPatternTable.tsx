"use client";

import React from "react";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DlpPattern } from "@/stores/admin-store";

const severityVariant: Record<string, "destructive" | "warning" | "info" | "secondary"> = {
  critical: "destructive",
  high: "warning",
  medium: "info",
  low: "secondary",
};

interface DlpPatternTableProps {
  patterns: DlpPattern[];
  onToggle: (patternId: string) => void;
  onEdit: (pattern: DlpPattern) => void;
  loading?: boolean;
}

export function DlpPatternTable({ patterns, onToggle, onEdit, loading }: DlpPatternTableProps) {
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
            <th>Name</th>
            <th>Category</th>
            <th>Severity</th>
            <th>Action</th>
            <th>Active</th>
            <th className="text-right">Edit</th>
          </tr>
        </thead>
        <tbody>
          {patterns.map((pattern) => (
            <tr key={pattern.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
              <td className="py-3 font-medium">{pattern.name}</td>
              <td className="py-3 text-muted-foreground">{pattern.category}</td>
              <td className="py-3">
                <Badge variant={severityVariant[pattern.severity] ?? "secondary"}>
                  {pattern.severity}
                </Badge>
              </td>
              <td className="py-3">
                <Badge variant="outline" className="capitalize">{pattern.action}</Badge>
              </td>
              <td className="py-3">
                <button
                  onClick={() => onToggle(pattern.id)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    pattern.active ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
                      pattern.active ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </td>
              <td className="py-3 text-right">
                <Button variant="ghost" size="icon" onClick={() => onEdit(pattern)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
          {patterns.length === 0 && (
            <tr>
              <td colSpan={6} className="py-8 text-center text-muted-foreground">
                No DLP patterns configured
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
