"use client";

import React, { useEffect, useState } from "react";
import { ToggleLeft, RefreshCw, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Flag = {
  id: string;
  key: string;
  description: string | null;
  enabled: boolean;
  percentage: number | null;
  tenantOverrides: Record<string, boolean> | null;
  updatedAt: string;
};

export default function FlagsAdminPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      const d = await api.get<Flag[]>("/flags");
      setFlags(d || []);
    } catch (e) { setMsg("Load failed: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const toggle = async (f: Flag) => {
    try {
      await api.put(`/flags/${f.id}`, { enabled: !f.enabled });
      setMsg(`${f.key} → ${!f.enabled ? "ON" : "OFF"}`);
      refresh();
    } catch (e) { setMsg("Toggle failed: " + (e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ToggleLeft className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Feature Flags</h2>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All flags ({flags.length})</CardTitle>
          <CardDescription>Toggle features globally or configure per-tenant overrides + percentage rollouts.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Key</th><th>Description</th><th>Enabled</th><th>Rollout %</th><th>Overrides</th><th className="text-right">Toggle</th></tr></thead>
            <tbody>
              {flags.map((f) => (
                <tr key={f.id}>
                  <td className="font-mono font-medium">{f.key}</td>
                  <td className="text-muted-foreground">{f.description || "—"}</td>
                  <td><Badge variant={f.enabled ? "success" : "secondary"}>{f.enabled ? "ON" : "OFF"}</Badge></td>
                  <td className="tabular-nums">{f.percentage != null ? f.percentage + "%" : "—"}</td>
                  <td className="text-muted-foreground">{f.tenantOverrides ? Object.keys(f.tenantOverrides).length + " tenants" : "—"}</td>
                  <td className="text-right">
                    <Button size="sm" variant={f.enabled ? "destructive" : "default"} onClick={() => toggle(f)}>
                      {f.enabled ? "Disable" : "Enable"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
