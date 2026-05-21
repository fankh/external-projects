"use client";

import React, { useEffect, useState } from "react";
import { CreditCard, RefreshCw, TrendingUp, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

type Plan = { id: string; name: string; priceCents: number; currency: string; interval: string };
type Subscription = { id: string; tenantId: string; planId: string; status: string; currentPeriodEnd: string };
type Usage = { tenantId: string; tokensTotal: number; queriesTotal: number; documentsIndexed: number };
type Invoice = { id: string; tenantId: string; amountCents: number; currency: string; status: string; issuedAt: string };

export default function BillingAdminPage() {
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const refresh = async () => {
    setLoading(true); setMsg("");
    try {
      const [p, s, u, i] = await Promise.allSettled([
        api.get<Plan[]>("/billing/plans"),
        api.get<Subscription>(`/billing/subscriptions/${tenantId}`),
        api.get<Usage>(`/billing/usage/${tenantId}`),
        api.get<Invoice[]>(`/billing/invoices/${tenantId}`),
      ]);
      setPlans(p.status === "fulfilled" ? p.value || [] : []);
      setSubscription(s.status === "fulfilled" ? s.value : null);
      setUsage(u.status === "fulfilled" ? u.value : null);
      setInvoices(i.status === "fulfilled" ? i.value || [] : []);
    } catch (e) { setMsg("Load error: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const formatCents = (cents: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: (currency || "USD").toUpperCase() }).format((cents || 0) / 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">Billing</h2>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card hoverable className="relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <CardContent className="p-5 pl-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Current subscription</p>
            {subscription ? (
              <>
                <p className="mt-2 text-lg font-semibold">{plans.find(p => p.id === subscription.planId)?.name || subscription.planId}</p>
                <Badge variant={subscription.status === "active" ? "success" : "warning"} className="mt-1">{subscription.status}</Badge>
                <p className="text-xs text-muted-foreground mt-2">Renews {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "—"}</p>
              </>
            ) : <p className="mt-2 text-sm text-muted-foreground">No active subscription</p>}
          </CardContent>
        </Card>

        <Card hoverable className="relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(var(--info))]" />
          <CardContent className="p-5 pl-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Usage (period-to-date)</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{usage?.tokensTotal?.toLocaleString() ?? "—"}</p>
            <p className="text-xs text-muted-foreground">tokens · {usage?.queriesTotal?.toLocaleString() ?? 0} queries · {usage?.documentsIndexed ?? 0} docs</p>
          </CardContent>
        </Card>

        <Card hoverable className="relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[hsl(var(--success))]" />
          <CardContent className="p-5 pl-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Next invoice</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {subscription && plans.find(p => p.id === subscription.planId)
                ? formatCents(plans.find(p => p.id === subscription.planId)!.priceCents, plans.find(p => p.id === subscription.planId)!.currency)
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{subscription ? `due ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : "no upcoming"}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" />Available plans</CardTitle>
          <CardDescription>{plans.length} plans configured in billing-service</CardDescription>
        </CardHeader>
        <CardContent>
          {plans.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr><th>Name</th><th>Price</th><th>Interval</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">{p.name}</td>
                    <td className="tabular-nums">{formatCents(p.priceCents, p.currency)}</td>
                    <td className="text-muted-foreground">{p.interval}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-muted-foreground">No plans seeded. Run billing migrations to populate.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" />Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length > 0 ? (
            <table className="w-full text-xs">
              <thead><tr><th>Issued</th><th>Amount</th><th>Status</th><th className="text-right">Actions</th></tr></thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{new Date(inv.issuedAt).toLocaleDateString()}</td>
                    <td className="tabular-nums">{formatCents(inv.amountCents, inv.currency)}</td>
                    <td><Badge variant={inv.status === "paid" ? "success" : "warning"}>{inv.status}</Badge></td>
                    <td className="text-right">
                      <a href={`/api/v1/billing/invoices/${inv.id}/download`} className="text-primary hover:underline" target="_blank" rel="noreferrer">PDF</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="text-xs text-muted-foreground">No invoices yet (Stripe is using placeholder keys; wire real Stripe to see data).</p>}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Billing service uses <code className="font-mono">STRIPE_API_KEY</code>. Current deploy has a placeholder — data here reflects DB state only. Set real keys in <code>.env</code> and restart billing-service for full functionality.
      </div>
    </div>
  );
}
