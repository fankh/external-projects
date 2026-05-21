"use client";

import React, { useState } from "react";
import { Cloud, Database, FileText, Globe, RefreshCw, HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type ConnectorKind = "s3" | "rest" | "confluence" | "sharepoint" | "gdrive";

const RAG_BASE = "/api/v1/rag";

const CONNECTOR_META: Record<ConnectorKind, { label: string; icon: typeof Cloud; description: string; endpoint: string }> = {
  s3:         { label: "AWS S3",          icon: Cloud,     description: "Sync objects from an S3 bucket / prefix",                endpoint: "/connectors/s3/sync" },
  rest:       { label: "REST API",        icon: Globe,     description: "Generic JSON-payload fetcher with item path",         endpoint: "/connectors/rest/sync" },
  confluence: { label: "Confluence Cloud", icon: FileText,  description: "Page through Atlassian Cloud spaces / pages",        endpoint: "/connectors/confluence/sync" },
  sharepoint: { label: "SharePoint",       icon: HardDrive, description: "Microsoft Graph drive-children listing",             endpoint: "/connectors/sharepoint/sync" },
  gdrive:     { label: "Google Drive",     icon: Database,  description: "Drive v3 list + export Google Docs to text",         endpoint: "/connectors/gdrive/sync" },
};

export default function ConnectorsAdminPage() {
  const [active, setActive] = useState<ConnectorKind>("s3");
  const [collectionId, setCollectionId] = useState("");
  const [body, setBody] = useState<Record<string, string>>({});
  const [resp, setResp] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const meta = CONNECTOR_META[active];

  const fields = (k: ConnectorKind): { name: string; placeholder: string; secret?: boolean }[] => {
    switch (k) {
      case "s3":         return [{ name: "bucket", placeholder: "my-docs" }, { name: "prefix", placeholder: "2024/" }, { name: "region", placeholder: "us-east-1" }, { name: "access_key_id", placeholder: "(env if blank)" }, { name: "secret_access_key", placeholder: "(env if blank)", secret: true }, { name: "endpoint_url", placeholder: "(MinIO etc)" }];
      case "rest":       return [{ name: "url", placeholder: "https://api.example.com/docs" }, { name: "items_path", placeholder: "data.docs" }, { name: "id_field", placeholder: "id" }, { name: "content_field", placeholder: "content" }, { name: "title_field", placeholder: "title" }];
      case "confluence": return [{ name: "base_url", placeholder: "https://acme.atlassian.net/wiki" }, { name: "username", placeholder: "user@acme.com" }, { name: "api_token", placeholder: "…", secret: true }, { name: "space_key", placeholder: "ENG (optional)" }];
      case "sharepoint": return [{ name: "tenant_id", placeholder: "Azure AD tenant id" }, { name: "client_id", placeholder: "app id" }, { name: "client_secret", placeholder: "…", secret: true }, { name: "site_id", placeholder: "hostname,site,web" }, { name: "folder_path", placeholder: "/" }];
      case "gdrive":     return [{ name: "oauth_token", placeholder: "OAuth2 access token", secret: true }, { name: "folder_id", placeholder: "(root if blank)" }, { name: "mime_filter", placeholder: "application/pdf,application/vnd.google-apps.document" }];
    }
  };

  const sync = async () => {
    if (!collectionId) { setMsg("collection_id is required"); return; }
    setBusy(true); setMsg(""); setResp(null);
    try {
      const payload: Record<string, unknown> = { collection_id: collectionId, ...body };
      // Trim empty strings out
      for (const k of Object.keys(payload)) if (payload[k] === "") delete payload[k];
      const token = localStorage.getItem("access_token");
      const r = await fetch(`${RAG_BASE}${meta.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const text = await r.text();
      try { setResp(JSON.parse(text)); }
      catch { setResp({ raw: text, status: r.status }); }
    } catch (e) { setMsg("Sync failed: " + (e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Cloud className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold">RAG Connectors</h2>
      </div>

      <div className="flex gap-1 border-b">
        {(Object.keys(CONNECTOR_META) as ConnectorKind[]).map((k) => {
          const m = CONNECTOR_META[k];
          const Icon = m.icon;
          return (
            <button key={k} onClick={() => { setActive(k); setBody({}); setResp(null); setMsg(""); }}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${active === k ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              <Icon className="h-4 w-4" />
              {m.label}
            </button>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <meta.icon className="h-4 w-4" />
            {meta.label}
          </CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="text-xs block">
            collection_id (required)
            <input className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono"
                   value={collectionId} onChange={(e) => setCollectionId(e.target.value)} placeholder="uuid" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {fields(active).map((f) => (
              <label key={f.name} className="text-xs block">
                {f.name}
                <input
                  type={f.secret ? "password" : "text"}
                  className="mt-1 w-full border rounded-sm px-2 py-1.5 bg-background text-xs font-mono"
                  value={body[f.name] ?? ""}
                  onChange={(e) => setBody({ ...body, [f.name]: e.target.value })}
                  placeholder={f.placeholder}
                />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={sync} disabled={busy}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {busy ? "Syncing..." : "Run sync"}
            </Button>
            <Badge variant="outline" className="text-[9px]">POST {RAG_BASE}{meta.endpoint}</Badge>
          </div>
          {msg && <div className="text-xs px-3 py-2 rounded-sm bg-muted">{msg}</div>}
          {resp != null && (
            <pre className="text-xs bg-muted rounded-sm p-3 overflow-auto max-h-64">
              {JSON.stringify(resp, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
