"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, RefreshCw, CheckCircle, AlertTriangle, Lock, Unlock, Download, Play } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

type PrivacyRequest = {
  id: string;
  userId: string;
  tenantId: string | null;
  type: "EXPORT" | "ERASURE" | "RESTRICTION" | "ACCESS";
  status: "PENDING_VERIFICATION" | "VERIFIED" | "IN_PROGRESS" | "COMPLETED" | "REJECTED" | "CANCELLED";
  slaDeadlineAt: string;
  hardDeleteAt: string | null;
  exportUrl: string | null;
  exportSizeBytes: number | null;
  verifiedAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
};

type VerifyResponse = { verified: boolean; checkedCount: number; brokenIds: string[] };

const statusVariant: Record<PrivacyRequest["status"], "default" | "secondary" | "warning" | "success" | "destructive" | "info"> = {
  PENDING_VERIFICATION: "warning",
  VERIFIED: "info",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  REJECTED: "destructive",
  CANCELLED: "secondary",
};

export default function CompliancePage() {
  const [tab, setTab] = useState<"status" | "privacy" | "audit" | "breach" | "phi" | "uba" | "perms" | "alerts" | "keys">("status");

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">Compliance</h2>
      </div>

      <div className="flex gap-1 border-b">
        <button onClick={() => setTab("status")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="status"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Status
        </button>
        <button onClick={() => setTab("privacy")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="privacy"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Privacy (GDPR)
        </button>
        <button onClick={() => setTab("audit")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="audit"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Audit Trail
        </button>
        <button onClick={() => setTab("breach")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="breach"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Breach Register
        </button>
        <button onClick={() => setTab("phi")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="phi"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          PHI (HIPAA)
        </button>
        <button onClick={() => setTab("uba")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="uba"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          UBA
        </button>
        <button onClick={() => setTab("perms")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="perms"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Permissions
        </button>
        <button onClick={() => setTab("alerts")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="alerts"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Alerts
        </button>
        <button onClick={() => setTab("keys")} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab==="keys"?"border-primary text-primary":"border-transparent text-muted-foreground hover:text-foreground"}`}>
          Keys
        </button>
      </div>

      {tab === "status" && <StatusPanel />}
      {tab === "privacy" && <PrivacyPanel />}
      {tab === "audit" && <AuditPanel />}
      {tab === "breach" && <BreachPanel />}
      {tab === "phi" && <PhiPanel />}
      {tab === "uba" && <UbaPanel />}
      {tab === "perms" && <PermissionsPanel />}
      {tab === "alerts" && <AlertsPanel />}
      {tab === "keys" && <KeysPanel />}
    </div>
  );
}

function PrivacyPanel() {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [breached, setBreached] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const refresh = async () => {
    setLoading(true);
    try {
      const page = await api.get<{ content: PrivacyRequest[] }>("/privacy/admin/requests?size=200");
      setRequests(page.content || []);
      const br = await api.get<PrivacyRequest[]>("/privacy/admin/sla-breached");
      setBreached(br || []);
    } catch (e) {
      setMsg("Failed: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const adminId = (typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}").id : "") || "";

  const act = async (id: string, action: "verify" | "fulfill") => {
    setMsg("");
    try {
      const body = action === "verify" ? { adminUserId: adminId, notes: "verified via admin console" } : { adminUserId: adminId };
      await api.post(`/privacy/requests/${id}/${action}`, body);
      setMsg(`${action} succeeded`);
      refresh();
    } catch (e) {
      setMsg(`${action} failed: ${(e as Error).message}`);
    }
  };

  const download = (id: string) => {
    const token = localStorage.getItem("access_token");
    const url = `${process.env.NEXT_PUBLIC_API_URL}/privacy/requests/${id}/export`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `privacy-export-${id}.json`;
        a.click();
      });
  };

  const runHardDeletes = async () => {
    setMsg("");
    try {
      const r = await api.post<{ processed: number }>("/privacy/admin/retention/run-now", {});
      setMsg(`Hard-delete sweep: ${r.processed} processed`);
      refresh();
    } catch (e) {
      setMsg(`Sweep failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        <Button variant="outline" size="sm" onClick={runHardDeletes}><Play className="h-4 w-4 mr-2" />Run hard-delete sweep</Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      {breached.length > 0 && (
        <Card hoverable className="border-[hsl(var(--destructive))]">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />SLA Breached ({breached.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="text-xs space-y-1">
              {breached.map((r) => (
                <li key={r.id}><span className="font-mono">{r.id.slice(0,8)}</span> · {r.type} · status={r.status} · deadline {formatDistanceToNow(new Date(r.slaDeadlineAt), { addSuffix: true })}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">DSR Queue ({requests.length})</CardTitle>
          <CardDescription>GDPR data-subject rights requests across all tenants</CardDescription></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Type</th><th>Subject</th><th>Status</th><th>SLA</th><th>Created</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id}>
                  <td><Badge variant="outline">{r.type}</Badge></td>
                  <td className="font-mono">{r.userId.slice(0,8)}…</td>
                  <td><Badge variant={statusVariant[r.status]}>{r.status}</Badge></td>
                  <td className="text-muted-foreground">{formatDistanceToNow(new Date(r.slaDeadlineAt), { addSuffix: true })}</td>
                  <td className="text-muted-foreground">{formatDistanceToNow(new Date(r.createdAt), { addSuffix: true })}</td>
                  <td className="text-right">
                    <div className="flex gap-1 justify-end">
                      {r.status === "PENDING_VERIFICATION" && <Button size="sm" variant="outline" onClick={() => act(r.id, "verify")}>Verify</Button>}
                      {r.status === "VERIFIED" && <Button size="sm" onClick={() => act(r.id, "fulfill")}>Fulfill</Button>}
                      {r.exportUrl && <Button size="sm" variant="ghost" onClick={() => download(r.id)}><Download className="h-3 w-3" /></Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {requests.length === 0 && !loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No requests yet</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function AuditPanel() {
  const [result, setResult] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const verify = async () => {
    setLoading(true);
    setMsg("");
    try {
      const r = await api.get<VerifyResponse>("/audit/verify");
      setResult(r);
    } catch (e) {
      setMsg("Verify failed: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit Chain Integrity</CardTitle>
          <CardDescription>Walk the SHA-256 hash chain and detect tampering or missing links</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={verify} disabled={loading}><CheckCircle className="h-4 w-4 mr-2" />Verify Chain</Button>
          {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {result.verified ? <Badge variant="success">VERIFIED</Badge> : <Badge variant="destructive">BROKEN</Badge>}
                <span className="text-xs text-muted-foreground">checked {result.checkedCount} entries</span>
              </div>
              {result.brokenIds.length > 0 && (
                <div className="text-xs space-y-1">
                  <div className="font-semibold">Broken:</div>
                  <ul className="font-mono text-muted-foreground">
                    {result.brokenIds.slice(0, 10).map((id) => <li key={id}>{id}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4" />Legal Hold</CardTitle>
          <CardDescription>Mark audit entries as tamper-proof via DB trigger. Released only by DBA intervention.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Legal-hold operations are performed per audit row via <span className="font-mono">POST /api/v1/audit/&#123;id&#125;/legal-hold</span>. Bulk UI pending.</p>
        </CardContent>
      </Card>
    </div>
  );
}

type BreachIncident = {
  id: string;
  tenantId: string | null;
  detectedAt: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "CONFIDENTIALITY" | "INTEGRITY" | "AVAILABILITY";
  affectedRecordCount: number;
  description: string;
  highRiskToSubjects: boolean;
  authorityDeadlineAt: string;
  authorityNotifiedAt: string | null;
  subjectsNotifiedAt: string | null;
  status: "OPEN" | "UNDER_INVESTIGATION" | "NOTIFIED" | "CLOSED";
};

const sevVariant: Record<BreachIncident["severity"], "secondary" | "warning" | "destructive"> = {
  LOW: "secondary", MEDIUM: "warning", HIGH: "destructive", CRITICAL: "destructive",
};

function BreachPanel() {
  const [incidents, setIncidents] = useState<BreachIncident[]>([]);
  const [overdue, setOverdue] = useState<BreachIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    severity: "MEDIUM" as BreachIncident["severity"],
    category: "CONFIDENTIALITY" as BreachIncident["category"],
    affectedCount: 0,
    description: "",
    highRisk: false,
  });

  const adminId = (typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}").id : "") || "";

  const refresh = async () => {
    setLoading(true);
    try {
      const page = await api.get<{ content: BreachIncident[] }>("/breach/incidents?size=200");
      setIncidents(page.content || []);
      const ov = await api.get<BreachIncident[]>("/breach/overdue");
      setOverdue(ov || []);
    } catch (e) {
      setMsg("Failed: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); }, []);

  const report = async () => {
    setMsg("");
    try {
      await api.post("/breach/incidents", {
        reportedBy: adminId,
        severity: form.severity,
        category: form.category,
        affectedCount: form.affectedCount,
        description: form.description,
        highRisk: form.highRisk,
      });
      setMsg("Breach recorded");
      setShowForm(false);
      refresh();
    } catch (e) {
      setMsg("Failed: " + (e as Error).message);
    }
  };

  const notifyAuth = async (id: string) => {
    const ref = prompt("Authority notification reference number?") || "";
    try {
      await api.post(`/breach/incidents/${id}/notify-authority`, { referenceNumber: ref, actor: adminId });
      setMsg("Authority notified"); refresh();
    } catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  const notifySubj = async (id: string) => {
    const cnt = Number(prompt("How many subjects notified?") || 0);
    try {
      await api.post(`/breach/incidents/${id}/notify-subjects`, { count: cnt, actor: adminId });
      setMsg("Subjects notified"); refresh();
    } catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  const close = async (id: string) => {
    try {
      await api.post(`/breach/incidents/${id}/status`, { status: "CLOSED", actor: adminId });
      setMsg("Closed"); refresh();
    } catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowForm(!showForm)}><AlertTriangle className="h-4 w-4 mr-2" />{showForm ? "Cancel" : "File New Breach"}</Button>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">Report breach</CardTitle>
          <CardDescription>GDPR Art.33 requires notification within 72 hours of detection</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs">Severity
                <select className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background" value={form.severity} onChange={(e) => setForm({...form, severity: e.target.value as BreachIncident["severity"]})}>
                  <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
                </select></label>
              <label className="text-xs">Category
                <select className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background" value={form.category} onChange={(e) => setForm({...form, category: e.target.value as BreachIncident["category"]})}>
                  <option>CONFIDENTIALITY</option><option>INTEGRITY</option><option>AVAILABILITY</option>
                </select></label>
              <label className="text-xs">Affected record count
                <input type="number" className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background" value={form.affectedCount} onChange={(e) => setForm({...form, affectedCount: Number(e.target.value)})} /></label>
              <label className="text-xs flex items-end gap-2 pb-1">
                <input type="checkbox" checked={form.highRisk} onChange={(e) => setForm({...form, highRisk: e.target.checked})} />
                High risk to subjects (Art.34)</label>
            </div>
            <label className="text-xs block">Description
              <textarea className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background" rows={3} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} /></label>
            <Button size="sm" onClick={report}>Submit</Button>
          </CardContent>
        </Card>
      )}

      {overdue.length > 0 && (
        <Card hoverable className="border-[hsl(var(--destructive))]">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Authority-notification overdue ({overdue.length})</CardTitle>
            <CardDescription>72-hour deadline passed without DPA notification</CardDescription></CardHeader>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Incident register ({incidents.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Severity</th><th>Category</th><th>Records</th><th>Status</th><th>72h deadline</th><th>Detected</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {incidents.map((b) => (
                <tr key={b.id}>
                  <td><Badge variant={sevVariant[b.severity]}>{b.severity}</Badge></td>
                  <td className="text-muted-foreground">{b.category}</td>
                  <td className="tabular-nums">{b.affectedRecordCount}</td>
                  <td><Badge variant={b.status==="CLOSED"?"success":b.status==="NOTIFIED"?"info":"warning"}>{b.status}</Badge></td>
                  <td className="text-muted-foreground">{b.authorityNotifiedAt ? "notified" : formatDistanceToNow(new Date(b.authorityDeadlineAt), { addSuffix: true })}</td>
                  <td className="text-muted-foreground">{formatDistanceToNow(new Date(b.detectedAt), { addSuffix: true })}</td>
                  <td className="text-right">
                    <div className="flex gap-1 justify-end">
                      {!b.authorityNotifiedAt && <Button size="sm" variant="outline" onClick={() => notifyAuth(b.id)}>Notify DPA</Button>}
                      {b.highRiskToSubjects && !b.subjectsNotifiedAt && <Button size="sm" variant="outline" onClick={() => notifySubj(b.id)}>Notify Subjects</Button>}
                      {b.status !== "CLOSED" && <Button size="sm" variant="ghost" onClick={() => close(b.id)}>Close</Button>}
                    </div>
                  </td>
                </tr>
              ))}
              {incidents.length === 0 && !loading && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No breaches on record</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function PhiPanel() {
  const [text, setText] = useState("Patient John Doe SSN 123-45-6789 DOB 05/12/1980 phone 555-123-4567");
  const [result, setResult] = useState<{ hitCount: number; types: string[]; maskedContent: string; severity: string; blocked: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const scan = async () => {
    setLoading(true); setMsg(""); setResult(null);
    try {
      const adminId = JSON.parse(localStorage.getItem("user") || "{}").id || "";
      const r = await api.post<typeof result>("/phi/scan", {
        content: text,
        userId: adminId,
        direction: "input",
      });
      setResult(r);
    } catch (e) {
      setMsg("Scan failed: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const sevColor = (s?: string) =>
    s === "CRITICAL" || s === "HIGH" ? "destructive" :
    s === "MEDIUM" ? "warning" :
    s === "LOW" ? "info" :
    "secondary";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">PHI (Protected Health Information) Scanner</CardTitle>
          <CardDescription>
            HIPAA Safe-Harbor 18-identifier detection via regex. Every scan is audited (count + types,
            never content) so PHI access is provable under §164.308(a)(1)(ii)(D).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="text-xs block">Sample content
            <textarea
              className="mt-1 w-full border rounded-sm px-3 py-2 bg-background text-sm"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <Button size="sm" onClick={scan} disabled={loading || !text.trim()}>
            <ShieldCheck className="h-4 w-4 mr-2" />Scan for PHI
          </Button>
          {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}
          {result && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={result.hitCount > 0 ? sevColor(result.severity) : "success"}>
                  {result.hitCount} hit{result.hitCount === 1 ? "" : "s"}
                </Badge>
                {result.severity !== "NONE" && (
                  <Badge variant={sevColor(result.severity)}>severity: {result.severity}</Badge>
                )}
                {result.blocked && <Badge variant="destructive">BLOCKED</Badge>}
                {result.types.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    types: {result.types.join(", ")}
                  </span>
                )}
              </div>
              <div className="text-xs">
                <div className="font-semibold uppercase tracking-wider text-muted-foreground mb-1">Masked output</div>
                <pre className="rounded-sm bg-muted p-3 whitespace-pre-wrap break-words">{result.maskedContent}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Seeded PHI patterns</CardTitle>
          <CardDescription>9 regex patterns covering HIPAA Safe-Harbor identifiers</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-xs space-y-1 text-muted-foreground">
            <li><span className="font-mono font-semibold text-destructive">CRITICAL</span> SSN (XXX-XX-XXXX)</li>
            <li><span className="font-mono font-semibold">HIGH</span> MRN · DOB · Insurance Member ID</li>
            <li><span className="font-mono font-semibold">MEDIUM</span> NPI · ICD-10 code · Phone · Email</li>
            <li><span className="font-mono font-semibold text-muted-foreground">LOW</span> IPv4 address</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

type BehaviorProfile = {
  userId: string;
  tenantId: string | null;
  totalObservations: number;
  riskScore: number;
  knownIpHashes: string[] | null;
  knownUaHashes: string[] | null;
  lastObservedAt: string | null;
};
type Anomaly = {
  id: string;
  userId: string;
  anomalyType: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskDelta: number;
  details: Record<string, unknown>;
  detectedAt: string;
  acknowledged: boolean;
};

function UbaPanel() {
  const [profiles, setProfiles] = useState<BehaviorProfile[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");
  const adminId = (typeof window !== "undefined" ? JSON.parse(localStorage.getItem("user") || "{}").id : "") || "";

  const refresh = async () => {
    setLoading(true);
    try {
      const [p, a] = await Promise.all([
        api.get<BehaviorProfile[]>("/uba/top-risk"),
        api.get<Anomaly[]>("/uba/anomalies"),
      ]);
      setProfiles(p || []);
      setAnomalies(a || []);
    } catch (e) { setMsg("Load failed: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const ack = async (id: string) => {
    try {
      await api.post(`/uba/anomalies/${id}/ack`, { adminId });
      setMsg("Acknowledged"); refresh();
    } catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  const sevVariant = (s: string) =>
    s === "CRITICAL" || s === "HIGH" ? "destructive" :
    s === "MEDIUM" ? "warning" :
    "info";
  const riskBadge = (r: number) =>
    r >= 70 ? "destructive" :
    r >= 40 ? "warning" :
    r >= 20 ? "info" :
    "secondary";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top-risk users ({profiles.length})</CardTitle>
          <CardDescription>Sorted by current risk score (0–100). New IP = +15, new device = +10, off-hours = +20, volume spike = +30. Score decays 1/observation.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>User</th><th>Observations</th><th>Risk</th><th>Known IPs</th><th>Devices</th><th>Last seen</th></tr></thead>
            <tbody>
              {profiles.map((p) => (
                <tr key={p.userId}>
                  <td className="font-mono">{p.userId.slice(0,8)}…</td>
                  <td className="tabular-nums">{p.totalObservations}</td>
                  <td><Badge variant={riskBadge(p.riskScore)}>{p.riskScore}</Badge></td>
                  <td className="tabular-nums">{(p.knownIpHashes || []).length}</td>
                  <td className="tabular-nums">{(p.knownUaHashes || []).length}</td>
                  <td className="text-muted-foreground">{p.lastObservedAt ? formatDistanceToNow(new Date(p.lastObservedAt), { addSuffix: true }) : "—"}</td>
                </tr>
              ))}
              {profiles.length === 0 && !loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No profiles yet — trigger logins to build baselines</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent anomalies ({anomalies.length})</CardTitle>
          <CardDescription>Detected deviations from user baselines, latest first</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Type</th><th>Severity</th><th>Δ risk</th><th>User</th><th>Detected</th><th className="text-right">Action</th></tr></thead>
            <tbody>
              {anomalies.map((a) => (
                <tr key={a.id}>
                  <td><Badge variant="outline">{a.anomalyType}</Badge></td>
                  <td><Badge variant={sevVariant(a.severity)}>{a.severity}</Badge></td>
                  <td className="tabular-nums">+{a.riskDelta}</td>
                  <td className="font-mono">{a.userId.slice(0,8)}…</td>
                  <td className="text-muted-foreground">{formatDistanceToNow(new Date(a.detectedAt), { addSuffix: true })}</td>
                  <td className="text-right">
                    {!a.acknowledged
                      ? <Button size="sm" variant="ghost" onClick={() => ack(a.id)}>Ack</Button>
                      : <span className="text-muted-foreground">ack&apos;d</span>}
                  </td>
                </tr>
              ))}
              {anomalies.length === 0 && !loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No anomalies</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

type Grant = {
  id: string;
  tenantId: string | null;
  subjectType: "USER" | "ROLE" | "TENANT" | "GLOBAL";
  subjectId: string | null;
  resourceType: string;
  resourceId: string | null;
  action: string;
  effect: "ALLOW" | "DENY";
  description: string | null;
  createdAt: string;
};
type Decision = { allowed: boolean; reason: string; matchedGrantId: string | null };

function PermissionsPanel() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");
  const [form, setForm] = useState({
    subjectType: "ROLE" as Grant["subjectType"],
    subjectId: "",
    resourceType: "privacy",
    resourceId: "",
    action: "read",
    effect: "ALLOW" as Grant["effect"],
    description: "",
  });
  const [test, setTest] = useState({
    userId: "",
    role: "user",
    resourceType: "privacy",
    resourceId: "",
    action: "read",
  });
  const [decision, setDecision] = useState<Decision | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const page = await api.get<{ content: Grant[] }>("/permissions/grants?size=200");
      setGrants(page.content || []);
    } catch (e) { setMsg("Load failed: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const create = async () => {
    setMsg("");
    try {
      await api.post("/permissions/grants", {
        subjectType: form.subjectType,
        subjectId: form.subjectId || null,
        resourceType: form.resourceType,
        resourceId: form.resourceId || null,
        action: form.action,
        effect: form.effect,
        description: form.description || null,
      });
      setMsg("Grant created");
      setForm({ ...form, subjectId: "", description: "" });
      refresh();
    } catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  const remove = async (id: string) => {
    if (!confirm("Revoke this grant?")) return;
    try {
      await api.delete(`/permissions/grants/${id}`);
      setMsg("Revoked");
      refresh();
    } catch (e) { setMsg("Failed: " + (e as Error).message); }
  };

  const runCheck = async () => {
    setDecision(null);
    try {
      const d = await api.post<Decision>("/permissions/check", {
        userId: test.userId || null,
        role: test.role,
        resourceType: test.resourceType,
        resourceId: test.resourceId || null,
        action: test.action,
      });
      setDecision(d);
    } catch (e) { setMsg("Check failed: " + (e as Error).message); }
  };

  return (
    <div className="space-y-4">
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Permission Evaluator</CardTitle>
          <CardDescription>Test who can do what. Default-deny unless a grant matches.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-5 gap-2">
            <label className="text-xs">User id<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={test.userId} onChange={(e) => setTest({...test, userId: e.target.value})} placeholder="optional" /></label>
            <label className="text-xs">Role<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={test.role} onChange={(e) => setTest({...test, role: e.target.value})} /></label>
            <label className="text-xs">Resource type<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={test.resourceType} onChange={(e) => setTest({...test, resourceType: e.target.value})} /></label>
            <label className="text-xs">Resource id<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={test.resourceId} onChange={(e) => setTest({...test, resourceId: e.target.value})} placeholder="blank = any" /></label>
            <label className="text-xs">Action<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={test.action} onChange={(e) => setTest({...test, action: e.target.value})} /></label>
          </div>
          <Button size="sm" onClick={runCheck}>Evaluate</Button>
          {decision && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant={decision.allowed ? "success" : "destructive"}>
                  {decision.allowed ? "ALLOW" : "DENY"}
                </Badge>
                <span className="text-xs text-muted-foreground">{decision.reason}</span>
              </div>
              {decision.matchedGrantId && <div className="text-xs text-muted-foreground font-mono">matched grant: {decision.matchedGrantId.slice(0,8)}…</div>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create grant</CardTitle>
          <CardDescription>USER &gt; ROLE &gt; TENANT &gt; GLOBAL. Explicit DENY always wins.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            <label className="text-xs">Subject type
              <select className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.subjectType} onChange={(e) => setForm({...form, subjectType: e.target.value as Grant["subjectType"]})}>
                <option>USER</option><option>ROLE</option><option>TENANT</option><option>GLOBAL</option>
              </select></label>
            <label className="text-xs">Subject id<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.subjectId} onChange={(e) => setForm({...form, subjectId: e.target.value})} placeholder="uuid or role name" /></label>
            <label className="text-xs">Effect
              <select className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.effect} onChange={(e) => setForm({...form, effect: e.target.value as Grant["effect"]})}>
                <option>ALLOW</option><option>DENY</option>
              </select></label>
            <label className="text-xs">Action<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.action} onChange={(e) => setForm({...form, action: e.target.value})} /></label>
            <label className="text-xs">Resource type<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.resourceType} onChange={(e) => setForm({...form, resourceType: e.target.value})} /></label>
            <label className="text-xs col-span-3">Resource id<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.resourceId} onChange={(e) => setForm({...form, resourceId: e.target.value})} placeholder="blank = wildcard" /></label>
          </div>
          <label className="text-xs block">Description<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} /></label>
          <Button size="sm" onClick={create}>Create grant</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Grants ({grants.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Subject</th><th>Resource</th><th>Action</th><th>Effect</th><th>Description</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {grants.map((g) => (
                <tr key={g.id}>
                  <td className="font-mono">{g.subjectType}:{g.subjectId || "*"}</td>
                  <td className="font-mono">{g.resourceType}:{g.resourceId || "*"}</td>
                  <td className="font-mono">{g.action}</td>
                  <td><Badge variant={g.effect === "ALLOW" ? "success" : "destructive"}>{g.effect}</Badge></td>
                  <td className="text-muted-foreground">{g.description || ""}</td>
                  <td className="text-right"><Button size="sm" variant="ghost" onClick={() => remove(g.id)}>Revoke</Button></td>
                </tr>
              ))}
              {grants.length === 0 && !loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No grants</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

type PromAlert = {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: "firing" | "pending" | "inactive";
  activeAt?: string;
  value?: string;
};

function AlertsPanel() {
  const [alerts, setAlerts] = useState<PromAlert[]>([]);
  const [rules, setRules] = useState<{ name: string; severity: string; state: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    setLoading(true);
    setMsg("");
    try {
      const [a, r] = await Promise.all([
        api.get<{ data: { alerts: PromAlert[] } }>("/monitoring/alerts"),
        api.get<{ data: { groups: { name: string; rules: { name: string; labels?: { severity?: string }; state?: string }[] }[] } }>("/monitoring/rules"),
      ]);
      setAlerts(a?.data?.alerts || []);
      const flat: { name: string; severity: string; state: string }[] = [];
      (r?.data?.groups || []).forEach((g) => (g.rules || []).forEach((rr) => flat.push({
        name: rr.name, severity: rr.labels?.severity || "none", state: rr.state || "inactive"
      })));
      setRules(flat);
    } catch (e) {
      setMsg("Load failed: " + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { refresh(); const i = setInterval(refresh, 30000); return () => clearInterval(i); }, []);

  const sevVariant = (s: string) =>
    s === "critical" ? "destructive" : s === "warning" ? "warning" : s === "info" ? "info" : "secondary";

  const firing = alerts.filter((a) => a.state === "firing");
  const pending = alerts.filter((a) => a.state === "pending");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
        <span className="text-xs text-muted-foreground self-center">Auto-refresh every 30s</span>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      <div className="grid grid-cols-3 gap-4">
        <Card hoverable>
          <CardContent className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Firing</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-destructive">{firing.length}</p>
          </CardContent>
        </Card>
        <Card hoverable>
          <CardContent className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Pending</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[hsl(var(--warning))]">{pending.length}</p>
          </CardContent>
        </Card>
        <Card hoverable>
          <CardContent className="p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Rules Configured</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums">{rules.length}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active alerts ({alerts.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Alert</th><th>Severity</th><th>State</th><th>Summary</th><th>Active for</th></tr></thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i}>
                  <td className="font-semibold">{a.labels.alertname}</td>
                  <td><Badge variant={sevVariant(a.labels.severity || "")}>{a.labels.severity || "none"}</Badge></td>
                  <td><Badge variant={a.state === "firing" ? "destructive" : a.state === "pending" ? "warning" : "secondary"}>{a.state}</Badge></td>
                  <td className="text-muted-foreground">{a.annotations.summary || ""}</td>
                  <td className="text-muted-foreground">{a.activeAt ? formatDistanceToNow(new Date(a.activeAt), { addSuffix: true }) : "—"}</td>
                </tr>
              ))}
              {alerts.length === 0 && !loading && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No active alerts — all quiet</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Configured rules ({rules.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Rule</th><th>Severity</th><th>State</th></tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td><Badge variant={sevVariant(r.severity)}>{r.severity}</Badge></td>
                  <td><Badge variant={r.state === "firing" ? "destructive" : r.state === "pending" ? "warning" : "secondary"}>{r.state}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

type ControlStatus = "PASS" | "WARN" | "FAIL";
type Control = { name: string; status: ControlStatus; evidence: string };
type Framework = { framework: string; controls: Control[]; passCount: number; totalCount: number; score: number };
type StatusResp = { generatedAt: string; frameworks: Framework[]; summary: Record<string, number> };

function StatusPanel() {
  const [data, setData] = useState<StatusResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    setLoading(true); setMsg("");
    try {
      const d = await api.get<StatusResp>("/compliance/status");
      setData(d);
    } catch (e) { setMsg("Load failed: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const sevVariant = (s: ControlStatus) => s === "PASS" ? "success" : s === "WARN" ? "warning" : "destructive";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
        {data && <span className="text-xs text-muted-foreground self-center">As of {new Date(data.generatedAt).toLocaleString()}</span>}
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      {data && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {data.frameworks.map((fw) => (
              <Card key={fw.framework} hoverable className="relative overflow-hidden">
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${fw.score === 1 ? "bg-[hsl(var(--success))]" : fw.score >= 0.7 ? "bg-[hsl(var(--warning))]" : "bg-destructive"}`} />
                <CardContent className="p-5 pl-6">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{fw.framework}</p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums">{Math.round(fw.score * 100)}%</p>
                  <p className="text-xs text-muted-foreground mt-1">{fw.passCount}/{fw.totalCount} controls passing</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {data.frameworks.map((fw) => (
            <Card key={fw.framework}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  {fw.framework}
                  <Badge variant={fw.score === 1 ? "success" : fw.score >= 0.7 ? "warning" : "destructive"}>
                    {fw.passCount}/{fw.totalCount}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <table className="w-full text-xs">
                  <thead><tr><th>Control</th><th>Status</th><th>Evidence</th></tr></thead>
                  <tbody>
                    {fw.controls.map((c, i) => (
                      <tr key={i}>
                        <td className="font-medium">{c.name}</td>
                        <td><Badge variant={sevVariant(c.status)}>{c.status}</Badge></td>
                        <td className="text-muted-foreground">{c.evidence}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader><CardTitle className="text-base">Live counters</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                {Object.entries(data.summary).map(([k, v]) => (
                  <div key={k} className="rounded-sm border border-border p-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</div>
                    <div className="text-base font-semibold tabular-nums">{typeof v === "number" && v < 1 && v > 0 ? (v * 100).toFixed(0) + "%" : v}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

type TenantKey = {
  id: string;
  tenantId: string;
  keyAlias: string;
  keyVersion: number;
  algorithm: string;
  state: "ACTIVE" | "PENDING_DEACTIVATION" | "DEACTIVATED";
  createdAt: string;
  activatedAt: string;
  deactivatedAt: string | null;
};

function KeysPanel() {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const [keys, setKeys] = useState<TenantKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    setLoading(true); setMsg("");
    try {
      const d = await api.get<TenantKey[]>(`/keys/${tenantId}`);
      setKeys(d || []);
    } catch (e) { setMsg("Load failed: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const rotate = async () => {
    setMsg("");
    try {
      await api.post(`/keys/${tenantId}/rotate`, {});
      setMsg("Key rotated. Old key enters 30-day grace period.");
      refresh();
    } catch (e) { setMsg("Rotate failed: " + (e as Error).message); }
  };

  const stateVariant = (s: TenantKey["state"]) =>
    s === "ACTIVE" ? "success" : s === "PENDING_DEACTIVATION" ? "warning" : "secondary";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={rotate}><Lock className="h-4 w-4 mr-2" />Rotate key</Button>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tenant encryption keys</CardTitle>
          <CardDescription>AES-256-GCM. Rotate creates a new ACTIVE key; old key enters 30-day PENDING_DEACTIVATION grace for re-wrap.</CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Alias</th><th>Version</th><th>Algorithm</th><th>State</th><th>Created</th><th>Deactivates</th></tr></thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id}>
                  <td className="font-mono">{k.keyAlias}</td>
                  <td className="tabular-nums">v{k.keyVersion}</td>
                  <td>{k.algorithm}</td>
                  <td><Badge variant={stateVariant(k.state)}>{k.state}</Badge></td>
                  <td className="text-muted-foreground">{new Date(k.createdAt).toLocaleDateString()}</td>
                  <td className="text-muted-foreground">{k.deactivatedAt ? new Date(k.deactivatedAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {keys.length === 0 && !loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No keys — rotate to create the first</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
