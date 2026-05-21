# KYRA AI Guardrail — Deployment Status

**Server:** 172.16.200.201 (8 vCPU / 31 GB RAM / 492 GB data disk)
**URL:** https://kyra-guardrail-dev.seekerslab.com/
**Admin:** admin@seekerslab.com
**Date:** 2026-04-17

## Health: ALL GREEN

| Layer | Status | Count |
|---|---|---|
| Gateway endpoints | ✅ | 18/18 |
| ML-service endpoints | ✅ | 7/7 |
| Infrastructure | ✅ | 5/5 (Prometheus, Alertmanager, Grafana, RAG, Frontend) |
| Containers | ✅ | 33/33 up |

## Features shipped: 112

### By category
- **Compliance P0:** 11 (all original P0s + key rotation)
- **AI/ML:** 15 (quality, cache, summarizer, optimizer, persona, injection L3, sentiment, rerank, self-query, retrieval)
- **RAG connectors:** 11 (S3, REST, Confluence, SharePoint, GDrive, SMB, NFS, SFTP, Azure Blob, GCS + runs)
- **Security:** 8 (PHI, DLP whitelist, injection, UBA, malicious detection, permissions RBAC+ABAC)
- **Observability:** 8 (metrics, alerts, dashboards ×5, tracing, scrape)
- **UX:** 11 (search, edit, autosave, citation, shortcuts, tutorial, export, accessibility)
- **Business:** 12 (billing, dunning, trial, pause, flags, reports, payment CRUD)
- **Architecture:** 7 (workflow engine, event sourcing, gRPC proto, CQRS, VPA, KEDA, circuit breaker)
- **Integrations:** 8 (Teams, Slack, GChat, GitLab, SIEM, SSO, PagerDuty, IMAP)
- **Ops:** 5 (backup, off-site, runbooks ×5, presence)
- **Infrastructure:** 7 (workspace hierarchy, Prometheus scrape, feature flags, DLP policies, processing register, classification, admin users)

### Admin console: 13 tabs
Dashboard · Users · Security · **Compliance** (9 sub-tabs: Status/Privacy/Audit/Breach/PHI/UBA/Permissions/Alerts/Keys) · SSO · Billing · Connectors · Flags · Reports · System

### Grafana: 5 dashboards
Compliance & Security · Service Health · AI Quality & Cache · Connector Activity · Security Deep Dive

### Prometheus: 8 alert rules
HighFailedLoginRate · PermissionDenyBurst · PhiCriticalSpike · AnomalySurge · HighSeverityAnomalyAny · BreachAuthorityDeadlineLate · AuditLegalHoldActivity · ServiceDown

### Migrations: V001–V029 (29 database migrations)

### RAG endpoints: 14
search · advanced-search · collections CRUD · documents CRUD · 11 connectors · rerank · self-query · runs · stats

## What needs real credentials to activate
- **LLM:** Set OPENAI_API_KEY / ANTHROPIC_API_KEY in .env → restart ml-service
- **Slack alerts:** Replace monitoring/slack_url_stub → restart alertmanager
- **Cohere rerank:** Set COHERE_API_KEY in .env → restart rag-service
- **PagerDuty:** Replace monitoring/pagerduty_key_stub → restart alertmanager
- **Off-site backup:** Set AWS_BACKUP_BUCKET + creds in .env → restart backup

## What remains (XL, multi-session)
- I2 Terraform IaC
- I6 Predictive autoscaling
- G6 Multi-region deployment
- H15 Collaborative editing (CRDT)
