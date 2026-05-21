"use client";

import React, { useEffect, useState } from "react";
import { Key, RefreshCw, Plus, Power, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

type SsoConfig = {
  id: string;
  tenantId: string;
  providerType: "saml" | "oidc" | "ldap";
  name: string;
  clientId: string | null;
  metadataUrl: string | null;
  authorizationUrl: string | null;
  tokenUrl: string | null;
  userinfoUrl: string | null;
  entityId: string | null;
  scopes: string[] | null;
  active: boolean;
  createdAt: string;
};

export default function SsoAdminPage() {
  const { user } = useAuthStore();
  // For this session the admin tenant is baked in; normally comes from user.tenantId
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const [providers, setProviders] = useState<SsoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    providerType: "oidc" as SsoConfig["providerType"],
    name: "",
    clientId: "",
    clientSecret: "",
    authorizationUrl: "",
    tokenUrl: "",
    userinfoUrl: "",
    metadataUrl: "",
    entityId: "",
    certificate: "",
  });

  const refresh = async () => {
    setLoading(true);
    try {
      const list = await api.get<SsoConfig[]>(`/sso/${tenantId}/providers`);
      setProviders(list || []);
    } catch (e) { setMsg("Load failed: " + (e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);

  const save = async () => {
    setMsg("");
    try {
      const body: Record<string, unknown> = { tenantId, providerType: form.providerType, name: form.name };
      if (form.providerType === "saml") {
        body.metadataUrl = form.metadataUrl || null;
        body.entityId = form.entityId || null;
        body.certificate = form.certificate || null;
      } else if (form.providerType === "oidc") {
        body.clientId = form.clientId;
        body.clientSecret = form.clientSecret;
        body.authorizationUrl = form.authorizationUrl;
        body.tokenUrl = form.tokenUrl;
        body.userinfoUrl = form.userinfoUrl || null;
      } else {
        body.config = {};
      }
      await api.post("/sso/config", body);
      setMsg("Provider saved");
      setShowForm(false);
      setForm({ ...form, name: "", clientId: "", clientSecret: "", authorizationUrl: "", tokenUrl: "", userinfoUrl: "", metadataUrl: "", entityId: "", certificate: "" });
      refresh();
    } catch (e) { setMsg("Save failed: " + (e as Error).message); }
  };

  const toggle = async (p: SsoConfig) => {
    try {
      const path = p.active ? "deactivate" : "activate";
      await api.post(`/sso/config/${p.id}/${path}`, {});
      setMsg(`Provider ${path}d`);
      refresh();
    } catch (e) { setMsg("Toggle failed: " + (e as Error).message); }
  };

  const remove = async (p: SsoConfig) => {
    if (!confirm(`Delete ${p.name}? Users of this provider will lose SSO access.`)) return;
    try {
      await api.delete(`/sso/config/${p.id}`);
      setMsg("Provider deleted");
      refresh();
    } catch (e) { setMsg("Delete failed: " + (e as Error).message); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Key className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">SSO Providers</h2>
      </div>

      <div className="flex gap-2">
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />{showForm ? "Cancel" : "Add provider"}
        </Button>
        <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>
      {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add SSO provider</CardTitle>
            <CardDescription>Configure SAML, OIDC, or LDAP. Tenant is the logged-in tenant.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <label className="text-xs">Type
                <select className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.providerType} onChange={(e) => setForm({...form, providerType: e.target.value as SsoConfig["providerType"]})}>
                  <option value="oidc">OIDC</option>
                  <option value="saml">SAML</option>
                  <option value="ldap">LDAP</option>
                </select></label>
              <label className="text-xs col-span-2">Display name<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} placeholder="e.g. Okta Corporate" /></label>
            </div>
            {form.providerType === "oidc" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs">Client ID<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.clientId} onChange={(e) => setForm({...form, clientId: e.target.value})} /></label>
                <label className="text-xs">Client Secret<input type="password" className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.clientSecret} onChange={(e) => setForm({...form, clientSecret: e.target.value})} /></label>
                <label className="text-xs col-span-2">Authorization URL<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.authorizationUrl} onChange={(e) => setForm({...form, authorizationUrl: e.target.value})} placeholder="https://idp/oauth2/v1/authorize" /></label>
                <label className="text-xs col-span-2">Token URL<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.tokenUrl} onChange={(e) => setForm({...form, tokenUrl: e.target.value})} placeholder="https://idp/oauth2/v1/token" /></label>
                <label className="text-xs col-span-2">Userinfo URL (optional)<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.userinfoUrl} onChange={(e) => setForm({...form, userinfoUrl: e.target.value})} /></label>
              </div>
            )}
            {form.providerType === "saml" && (
              <div className="space-y-2">
                <label className="text-xs block">Metadata URL<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.metadataUrl} onChange={(e) => setForm({...form, metadataUrl: e.target.value})} placeholder="https://idp/saml/metadata" /></label>
                <label className="text-xs block">Entity ID<input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" value={form.entityId} onChange={(e) => setForm({...form, entityId: e.target.value})} /></label>
                <label className="text-xs block">Certificate (PEM)<textarea className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono" rows={4} value={form.certificate} onChange={(e) => setForm({...form, certificate: e.target.value})} /></label>
              </div>
            )}
            {form.providerType === "ldap" && (
              <div className="text-xs text-muted-foreground">LDAP config passed through sso-service generic <code>config</code> JSON (not editable in this admin UI yet).</div>
            )}
            <Button size="sm" onClick={save} disabled={!form.name}>Save</Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Configured providers ({providers.length})</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead><tr><th>Name</th><th>Type</th><th>Client/Entity</th><th>Active</th><th>Created</th><th className="text-right">Actions</th></tr></thead>
            <tbody>
              {providers.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td><Badge variant="outline">{p.providerType.toUpperCase()}</Badge></td>
                  <td className="font-mono text-muted-foreground">{p.clientId || p.entityId || "—"}</td>
                  <td><Badge variant={p.active ? "success" : "secondary"}>{p.active ? "active" : "disabled"}</Badge></td>
                  <td className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</td>
                  <td className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => toggle(p)} title={p.active ? "Deactivate" : "Activate"}>
                        <Power className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {providers.length === 0 && !loading && <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No SSO providers configured</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
