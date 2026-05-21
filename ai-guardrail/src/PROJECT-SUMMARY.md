# KYRA AI Guardrail — Project Summary

## Overview

KYRA AI Guardrail is an enterprise LLM security and governance platform. 33 Docker containers on a single VM providing secure AI chat with DLP, prompt injection defense, PHI detection, RBAC+ABAC permissions, compliance automation (SOC2/GDPR/HIPAA), RAG retrieval from 11 connectors, and a comprehensive admin console.

**URL:** https://kyra-guardrail-dev.seekerslab.com/
**Admin:** admin@seekerslab.com
**Server:** 172.16.200.201 (8 vCPU / 31 GB / 492 GB data)

---

## Feature Count: 116

| Category | Count | Highlights |
|---|---|---|
| Compliance P0 | 11 | Audit chain, GDPR DSR, PHI, breach, permissions, UBA, MFA, key rotation, backup |
| AI / ML | 16 | Quality scoring, citation verify, cache, optimizer, summarizer, persona, injection L3, sentiment, rerank, autoscaling |
| RAG Connectors | 11 | S3, REST, Confluence, SharePoint, GDrive, SMB, NFS, SFTP, Azure Blob, GCS + runs |
| Security | 8 | PHI detection, DLP whitelist, injection L3, UBA, malicious detection, permissions |
| Observability | 9 | Metrics, 8 alerts, 5 dashboards, tracing, scrape, SIEM, OpenSearch indexer |
| UX | 12 | Search, autosave, edit, citation, shortcuts, tutorial, export, a11y, flags UI |
| Business | 12 | Billing, dunning, trial, pause, payment CRUD, flags, reports, register, classification |
| Architecture | 11 | Workflow engine, event sourcing, gRPC, CQRS, VPA, KEDA, Terraform, multi-region |
| Integrations | 9 | Teams, Slack, GChat, GitLab, SIEM, SSO, PagerDuty, IMAP, collab scaffold |
| Ops | 6 | Backup, off-site, 5 runbooks, activation scripts, presence |

---

## Services (33 containers)

### Backend (18 Java Spring Boot)
api-gateway, auth-service, chat-service, security-service, bookmark-service, feedback-service, branching-service, sharing-service, insights-service, analytics-service, notification-service, memory-service, tenant-service, billing-service, agent-service, workflow-service, sso-service, integration-service

### ML (2 Python FastAPI)
- **ml-service** (port 8002): LLM proxy, quality scoring, injection detection, sentiment, cache, persona, query optimizer, summarizer, autoscaling forecast
- **rag-service** (port 8001): Vector search, 11 connectors, rerank, self-query, advanced chunking

### Frontend
- **Next.js** (port 3000): 13-tab admin console, chat UI, onboarding tutorial, keyboard shortcuts
- **nginx** (port 80/443): TLS termination, reverse proxy

### Infrastructure
Postgres 16, Redis 7, Milvus 2.3, milvus-etcd, milvus-minio, OpenSearch 2.11

### Observability
Prometheus 2.51, Alertmanager 0.27, Grafana 10.4, OTel Collector 0.113

### Ops
backup (pg_dump cron container)

---

## Admin Console — 13 Tabs

1. **Dashboard** — overview stats
2. **Users** — CRUD, role assignment, suspend/activate
3. **Security** — DLP patterns, security events
4. **Compliance** (9 sub-tabs):
   - Status (SOC2 6/6, GDPR 6/6, HIPAA 7/7 — live scores)
   - Privacy (GDPR DSR queue + verify + fulfill + download)
   - Audit (SHA-256 chain verify + legal hold)
   - Breach (72h tracker + notify DPA + notify subjects)
   - PHI (scanner with 9 Safe-Harbor patterns)
   - UBA (top-risk users + anomaly history + acknowledge)
   - Permissions (evaluator + grant CRUD)
   - Alerts (live Prometheus alerts + rules)
   - Keys (encryption key rotation)
5. **SSO** — OIDC/SAML/LDAP provider management
6. **Billing** — subscription, usage, plans, invoices, payment methods
7. **Connectors** — 5 connector forms (S3/REST/Confluence/SharePoint/GDrive)
8. **Flags** — feature flag toggles with rollout %
9. **Reports** — schedule + generate
10. **System** — settings

---

## Database: 29 Migrations (V001-V029)

**Key tables:** users, roles, tenants, sessions, conversations, messages, documents, collections, audit_logs, security_events, dlp_patterns, dlp_whitelist_rules, privacy_requests, breach_incidents, user_behavior_profiles, user_anomalies, permission_grants, tenant_keys, processing_activities, feature_flags, workflow_definitions, workflow_runs, domain_events, report_schedules, generated_reports, connector_sync_runs, workspaces, teams, team_members, subscriptions, invoices, pricing_plans

---

## Security Posture (audited 2026-04-17)

- TLSv1.3 + AES-256-GCM-SHA384
- HSTS max-age=31536000
- All internal ports on 127.0.0.1 (only 80/443 public)
- JWT HS512 with 512-bit secret
- Bcrypt passwords, no defaults
- RBAC + ABAC permission system (deny-overrides)
- Rate limiting (100 req/min, 500 admin)
- Audit: 31/31 checks pass, 0 critical, 0 high

---

## Observability

### Prometheus Metrics (20+ custom)
kyra_phi_scans_total, kyra_phi_hits_total, kyra_privacy_requests_total, kyra_breach_reported_total, kyra_uba_anomalies_total, kyra_uba_observations_total, kyra_permission_decisions_total, kyra_audit_entries_total, kyra_response_quality_score, kyra_citation_support_ratio, kyra_llm_tokens_total, kyra_llm_calls_total, kyra_llm_latency_seconds, kyra_injection_detections_total, kyra_sentiment_total, kyra_quality_warnings_total, kyra_autoscale_recommended_replicas

### Alert Rules (8)
HighFailedLoginRate, PermissionDenyBurst, PhiCriticalSpike, AnomalySurge, HighSeverityAnomalyAny, BreachAuthorityDeadlineLate, AuditLegalHoldActivity, ServiceDown

### Grafana Dashboards (5)
KYRA Compliance & Security, KYRA Service Health, KYRA AI Quality & Cache, KYRA Connector Activity, KYRA Security Deep Dive

---

## Git Commits (11)

| # | Summary |
|---|---|
| 1 | 10 P0 compliance items + core UX |
| 2 | Key rotation, 9 connectors, dunning, audit search |
| 3 | Semantic cache, summarizer, 11 connectors |
| 4 | Injection L3, flags, reports, query optimizer, persona |
| 5 | Contextual DLP, sentiment, onboarding tutorial, flags UI |
| 6 | Teams/Slack, payment CRUD, Cohere rerank |
| 7 | Google Chat, GitLab CI, self-query RAG, WCAG |
| 8 | All 12 remaining M items (IMAP, presence, VPA, KEDA, gRPC, CQRS, workspace...) |
| 9 | Workflow engine + event sourcing (XL MVPs) |
| 10 | Terraform IaC, predictive autoscaling, multi-region, collaborative editing |
| 11 | Security hardening (7 fixes, all verified) |
