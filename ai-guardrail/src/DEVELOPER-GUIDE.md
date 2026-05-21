# KYRA AI Guardrail - Developer Guide

## Architecture Overview

KYRA AI Guardrail is a microservices-based enterprise AI security gateway with 21 backend services, 2 ML services, and a Next.js frontend. All client traffic flows through Nginx to the API Gateway, which routes to downstream services.

```
                         ┌──────────┐
                         │  Nginx   │ :80
                         └────┬─────┘
                    ┌─────────┴─────────┐
              ┌─────┴──────┐     ┌──────┴───────┐
              │  Frontend  │     │ API Gateway  │
              │ Next.js:3000│     │Spring CG:8080│
              └────────────┘     └──┬──┬──┬──┬──┘
         ┌──────────┬───────────────┘  │  │  └────────────┬──────────┐
  ┌──────┴───┐ ┌────┴────┐ ┌──────────┴──┴───┐  ┌────────┴───┐ ┌────┴──────┐
  │Auth :8081│ │Chat:8082│ │Security  :8083  │  │Memory:8023│ │Tenant:8026│
  └──────────┘ └────┬──┬─┘ └─────────────────┘  └───────────┘ └───────────┘
                    │  │
         ┌──────────┘  └──────────┐
  ┌──────┴──────┐         ┌──────┴──────┐
  │RAG Svc:8001 │         │ML Svc :8002 │
  │  FastAPI    │         │  FastAPI    │
  └──────┬──────┘         └─────────────┘
         │
  ┌──────┼──────────┐
  │      │          │
┌─┴──┐ ┌─┴──┐ ┌────┴──────────────────┐
│Milv│ │MinIO│ │PostgreSQL:5432 Redis:6379│
└────┘ └────┘ └────────────────────────┘
```

## Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Reverse Proxy | Nginx | 1.25 |
| Frontend | Next.js + React + TypeScript + Tailwind + shadcn/ui + Zustand | 14 / 18 / 5 |
| API Gateway | Spring Cloud Gateway | 2023.0.x |
| Backend Services | Java 21 + Spring Boot | 3.3.5 |
| ML Services | Python + FastAPI | 3.11+ / 0.109+ |
| Database | PostgreSQL | 16.x |
| Cache | Redis | 7.x |
| Vector DB | Milvus | 2.3+ |
| Search | OpenSearch | 2.11 |
| Object Storage | MinIO | Latest |
| Monitoring | Prometheus + Grafana + Loki | Latest |
| Container | Docker + Kubernetes | 24.x / 1.28+ |
| CI/CD | GitHub Actions | Latest |

---

## Service Registry (21 services)

### Core Services (Phase 1)
| Service | Port | Language | Description |
|---------|------|----------|-------------|
| Common (lib) | - | Java | Shared DTOs, exceptions, JWT, audit |
| API Gateway | 8080 | Java | Routing, JWT auth, rate limiting, tenant context |
| Auth Service | 8081 | Java | Login, MFA, JWT, sessions, signup, onboarding |
| Chat Service | 8082 | Java | Conversations, SSE streaming, personas, memory |
| Security Service | 8083 | Java | DLP scanning, threat detection, risk scoring |
| RAG Service | 8001 | Python | Document ingestion, vector search, hybrid retrieval |
| ML Service | 8002 | Python | LLM inference, model routing, security ML, memory extraction |

### Feature Services (Phase 2)
| Service | Port | Language | Description |
|---------|------|----------|-------------|
| Bookmark Service | 8014 | Java | Save/organize AI responses, folders, tags |
| Feedback Service | 8015 | Java | Rating collection, trends, aggregation |
| Branching Service | 8017 | Java | Alternate conversation paths, compare, merge |
| Sharing Service | 8018 | Java | Share via email/link, expiring tokens, analytics |
| Insights Service | 8019 | Java | Usage analytics, achievements, productivity |
| Analytics Service | 8084 | Java | Real-time usage tracking, quota enforcement |
| Notification Service | 8085 | Java | In-app, email, WebSocket notifications |

### Enterprise Services (Phase 3)
| Service | Port | Language | Description |
|---------|------|----------|-------------|
| Memory Service | 8023 | Java | LTM/STM, extraction, consolidation, retrieval |
| Tenant Service | 8026 | Java | Multi-tenancy, RLS, tenant lifecycle |
| Billing Service | 8027 | Java | Stripe subscriptions, metering, invoices |

### Advanced Services (Phase 4)
| Service | Port | Language | Description |
|---------|------|----------|-------------|
| Agent Service | 8028 | Java | Tool execution, planning, approval workflows |
| Workflow Service | 8029 | Java | Purpose workflows, structured outputs |
| SSO Service | 8030 | Java | SAML 2.0, OIDC, LDAP authentication |
| Integration Service | 8031 | Java | Slack/Teams bots, webhooks, SCIM provisioning |

### Infrastructure
| Component | Port | Description |
|-----------|------|-------------|
| PostgreSQL | 5432 | Primary database |
| Redis | 6379 | Cache, sessions, rate limiting |
| Milvus | 19530 | Vector embeddings |
| OpenSearch | 9200 | Full-text search, logs |
| MinIO | 9000/9001 | Object storage |
| Nginx | 80 | Reverse proxy, SSL, security headers |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3001 | Dashboards |
| Loki | 3100 | Log aggregation |
| Frontend | 3000 | Next.js web app |

---

## Quick Start

```bash
cd src/
cp .env.example .env
# Edit .env: add OPENAI_API_KEY, ANTHROPIC_API_KEY, STRIPE_API_KEY
docker-compose up --build

# Optional: monitoring stack
cd monitoring/
docker-compose -f docker-compose.monitoring.yml up -d
```

- App: http://localhost (via Nginx) or http://localhost:3000 (direct)
- API: http://localhost:8080
- MinIO Console: http://localhost:9001
- Grafana: http://localhost:3001
- Default admin: `admin@kyra.local` / `admin123`

---

## Project Structure

```
src/
├── docker-compose.yml              # All 28 services
├── .env.example                    # Environment variables
├── nginx/nginx.conf                # Reverse proxy config
├── DEVELOPER-GUIDE.md              # This file
├── CODING-CONVENTIONS.md           # Code patterns & templates
├── ADDING-FEATURES.md              # How to add new features
├── CLAUDE.md                       # AI assistant context
│
├── database/migrations/            # 13 Flyway SQL migrations
│   ├── V001__initial_schema.sql    # Core tables (users, conversations, messages, etc.)
│   ├── V002__seed_data.sql         # Roles, personas, DLP patterns, quota tiers
│   ├── V003__feedback_aggregates.sql
│   ├── V004__notifications.sql
│   ├── V005__insights.sql
│   ├── V006__branching.sql
│   ├── V007__memory_system.sql
│   ├── V008__multi_tenancy.sql
│   ├── V009__billing.sql
│   ├── V010__agents.sql
│   ├── V011__workflows.sql
│   ├── V012__sso.sql
│   └── V013__integrations.sql
│
├── backend/                        # 18 Java Spring Boot services + common lib
│   ├── common/                     # Shared: ApiResponse, exceptions, JWT, audit
│   ├── api-gateway/                # :8080 routing, auth filter, rate limit, tenant filter
│   ├── auth-service/               # :8081 login, MFA, JWT, signup, onboarding
│   ├── chat-service/               # :8082 conversations, SSE streaming, personas
│   ├── security-service/           # :8083 DLP, threat detection, risk scoring
│   ├── bookmark-service/           # :8014 bookmarks, folders, tags, search
│   ├── feedback-service/           # :8015 ratings, trends, aggregation, export
│   ├── branching-service/          # :8017 conversation branches, compare, merge
│   ├── sharing-service/            # :8018 share links, email, view tracking
│   ├── insights-service/           # :8019 usage stats, achievements, productivity
│   ├── analytics-service/          # :8084 real-time tracking, quota enforcement
│   ├── notification-service/       # :8085 in-app, email, alerts
│   ├── memory-service/             # :8023 LTM/STM, extraction, consolidation
│   ├── tenant-service/             # :8026 multi-tenancy, RLS, lifecycle
│   ├── billing-service/            # :8027 Stripe, subscriptions, invoices
│   ├── agent-service/              # :8028 tool execution, planning, approvals
│   ├── workflow-service/           # :8029 purpose workflows, structured outputs
│   ├── sso-service/                # :8030 SAML, OIDC, LDAP
│   └── integration-service/        # :8031 Slack, Teams, webhooks, SCIM
│
├── ml-services/                    # Python FastAPI services
│   ├── rag-service/                # :8001 document ingestion, vector search
│   │   └── src/services/           # embedding, chunking, indexing, search,
│   │                               # hybrid_search, reranker, citations,
│   │                               # query_enhancement, advanced_chunking
│   └── ml-service/                 # :8002 LLM inference, security ML, memory
│       └── src/
│           ├── providers/          # OpenAI, Anthropic, Azure
│           ├── services/           # llm, router, cache, planning_engine,
│           │                       # memory_extraction, memory_consolidation,
│           │                       # prompt_injection_classifier, ner_pii_detector,
│           │                       # anomaly_detector, data_classifier
│           └── api/                # completions, memory, security, agents
│
├── frontend/                       # Next.js 14 + React 18 + TypeScript
│   └── src/
│       ├── app/                    # 22 pages (login, signup, onboarding, chat,
│       │                           #   documents, dashboard, settings, bookmarks,
│       │                           #   history, analytics, admin/*, not-found)
│       ├── components/             # 32 components (ui, layout, chat, documents,
│       │                           #   dashboard, admin, bookmarks, notifications,
│       │                           #   analytics, onboarding)
│       ├── stores/                 # 6 Zustand stores (auth, chat, ui, bookmark,
│       │                           #   notification, admin)
│       ├── lib/                    # api.ts, streaming.ts, utils.ts
│       └── types/                  # TypeScript interfaces
│
├── k8s/                            # 11 Kubernetes manifests
│   ├── namespace.yml, configmap.yml, secrets.yml
│   ├── ingress.yml, hpa.yml
│   └── deployments/                # 6 service deployments
│
├── monitoring/                     # Prometheus + Grafana + Loki
│   ├── docker-compose.monitoring.yml
│   ├── prometheus.yml
│   └── grafana/provisioning/
│
└── .github/workflows/ci.yml       # CI/CD pipeline
```

---

## Complete API Endpoint Map

### Auth & Onboarding (auth-service :8081)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/auth/login | Login with email/password |
| POST | /v1/auth/mfa/verify | Verify TOTP MFA code |
| POST | /v1/auth/refresh | Refresh JWT tokens |
| POST | /v1/auth/logout | Logout (blacklists token) |
| GET | /v1/auth/me | Get current user profile |
| POST | /v1/auth/signup | Create account + tenant |
| POST | /v1/auth/verify-email | Verify email token |
| POST | /v1/onboarding/company | Update company profile |
| POST | /v1/onboarding/invite-team | Send team invitations |
| POST | /v1/onboarding/personas | Select preferred personas |
| POST | /v1/onboarding/complete | Complete onboarding |
| GET | /v1/onboarding/status | Get onboarding progress |

### Chat & Conversations (chat-service :8082)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/chat/message | Send message (non-streaming) |
| POST | /v1/chat/stream | Send message (SSE streaming) |
| POST | /v1/chat/regenerate | Regenerate last response |
| GET | /v1/conversations | List conversations (paginated) |
| POST | /v1/conversations | Create conversation |
| GET | /v1/conversations/{id} | Get conversation + messages |
| PATCH | /v1/conversations/{id} | Update title/pin |
| DELETE | /v1/conversations/{id} | Soft delete |
| GET | /v1/personas | List active personas |
| GET | /v1/personas/{id} | Get persona details |

### Security & Audit (security-service :8083)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/security/scan | DLP scan content |
| GET | /v1/security/patterns | List DLP patterns |
| POST | /v1/security/patterns | Create DLP pattern |
| PUT | /v1/security/patterns/{id} | Update DLP pattern |
| GET | /v1/security/risk/{userId} | User risk assessment |
| GET | /v1/security/risk/{userId}/history | Risk score history |
| GET | /v1/security/risk/dashboard | Security overview |
| GET | /v1/audit/events | Security events (paginated) |
| GET | /v1/audit/logs | Audit logs (paginated) |
| GET | /v1/audit/export | Export logs (JSON/CSV) |

### RAG & Documents (rag-service :8001)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/collections | List collections |
| POST | /v1/collections | Create collection |
| GET | /v1/collections/{id} | Get collection details |
| DELETE | /v1/collections/{id} | Delete collection + vectors |
| POST | /v1/documents/collections/{id}/documents | Upload document |
| GET | /v1/documents/collections/{id}/documents | List documents |
| GET | /v1/documents/{id} | Get document status |
| DELETE | /v1/documents/{id} | Delete document + vectors |
| POST | /v1/rag/search | Basic vector search |
| POST | /v1/rag/advanced-search | Full pipeline (HyDE + reranking + hybrid) |

### ML Inference & AI (ml-service :8002)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/completions | LLM completion |
| POST | /v1/completions/stream | LLM streaming (SSE) |
| GET | /v1/models | List available models |
| POST | /v1/embeddings | Generate embeddings |
| POST | /v1/memory/extract | Extract memories from messages |
| POST | /v1/memory/consolidate | Consolidate memory list |
| POST | /v1/security/scan-injection | 3-layer injection detection |
| POST | /v1/security/detect-pii | NER PII detection |
| POST | /v1/security/check-anomaly | Behavioral anomaly check |
| POST | /v1/security/classify | Data sensitivity classification |
| POST | /v1/security/comprehensive-scan | All security checks |
| POST | /v1/agents/plan | Generate execution plan |

### Bookmarks (bookmark-service :8014)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/bookmarks | List bookmarks (paginated, filterable) |
| POST | /v1/bookmarks | Create bookmark |
| GET | /v1/bookmarks/{id} | Get bookmark |
| PUT | /v1/bookmarks/{id} | Update bookmark |
| DELETE | /v1/bookmarks/{id} | Delete bookmark |
| GET | /v1/bookmarks/search | Full-text search |
| GET | /v1/bookmarks/folders | List folders |
| POST | /v1/bookmarks/folders | Create folder |
| PUT | /v1/bookmarks/folders/{id} | Update folder |
| DELETE | /v1/bookmarks/folders/{id} | Delete folder |
| PUT | /v1/bookmarks/folders/reorder | Reorder folders |

### Feedback (feedback-service :8015)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/feedback | Submit feedback |
| GET | /v1/feedback/message/{messageId} | Get feedback for message |
| PUT | /v1/feedback/{id} | Update feedback |
| GET | /v1/feedback/stats | Feedback statistics |
| GET | /v1/feedback/trends | Daily trend data |
| GET | /v1/feedback/export | Export as CSV |

### Branching (branching-service :8017)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/conversations/{id}/branches | List branches |
| POST | /v1/conversations/{id}/branches | Create branch |
| GET | /v1/conversations/{id}/branches/{bid} | Get branch |
| PUT | /v1/conversations/{id}/branches/{bid}/activate | Switch branch |
| DELETE | /v1/conversations/{id}/branches/{bid} | Delete branch |
| GET | /v1/conversations/{id}/branches/compare | Compare branches |

### Sharing (sharing-service :8018)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/share | Share content |
| GET | /v1/share/link/{token} | View shared (public) |
| GET | /v1/share/my-shares | List my shares |
| DELETE | /v1/share/{id} | Revoke share |
| GET | /v1/share/{id}/analytics | Share analytics |

### Insights (insights-service :8019)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/insights/usage | Usage stats by period |
| GET | /v1/insights/trends | Daily trends |
| GET | /v1/insights/achievements | All achievements |
| GET | /v1/insights/summary | Dashboard summary |

### Analytics (analytics-service :8084)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/analytics/usage/{userId} | User usage summary |
| GET | /v1/analytics/usage/{userId}/quota | Check quota |
| POST | /v1/analytics/track | Record usage event |
| GET | /v1/analytics/department/{deptId} | Department stats |
| GET | /v1/analytics/overview | System overview |

### Notifications (notification-service :8085)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/notifications | List notifications |
| GET | /v1/notifications/unread-count | Unread count |
| POST | /v1/notifications | Create notification |
| PATCH | /v1/notifications/{id}/read | Mark as read |
| POST | /v1/notifications/read-all | Mark all read |
| DELETE | /v1/notifications/{id} | Dismiss |

### Memory (memory-service :8023)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/memory/{userId}/context | Get memory context |
| POST | /v1/memory/extract | Trigger extraction |
| GET | /v1/memory/{userId} | List memories |
| DELETE | /v1/memory/{id} | Delete memory |
| POST | /v1/memory/{userId}/consolidate | Consolidate |
| GET | /v1/memory/{userId}/stats | Memory statistics |

### Tenants (tenant-service :8026)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/tenants | Create tenant |
| GET | /v1/tenants/{id} | Get tenant |
| GET | /v1/tenants/by-slug/{slug} | Lookup by slug |
| PATCH | /v1/tenants/{id} | Update settings |
| POST | /v1/tenants/{id}/suspend | Suspend |
| POST | /v1/tenants/{id}/activate | Activate |
| DELETE | /v1/tenants/{id} | Deactivate |
| GET | /v1/tenants | List all (admin) |

### Billing (billing-service :8027)
| Method | Path | Description |
|--------|------|-------------|
| POST | /v1/billing/subscriptions | Create subscription |
| GET | /v1/billing/subscriptions/{tenantId} | Get subscription |
| POST | /v1/billing/subscriptions/{id}/upgrade | Upgrade plan |
| POST | /v1/billing/subscriptions/{id}/downgrade | Downgrade plan |
| POST | /v1/billing/subscriptions/{id}/cancel | Cancel |
| POST | /v1/billing/subscriptions/{id}/resume | Resume |
| GET | /v1/billing/plans | List pricing plans |
| POST | /v1/billing/usage/record | Record usage |
| GET | /v1/billing/usage/{tenantId} | Usage summary |
| GET | /v1/billing/invoices/{tenantId} | List invoices |
| GET | /v1/billing/invoices/{id}/download | Download PDF |
| POST | /v1/billing/webhooks/stripe | Stripe webhook handler |

### Agents (agent-service :8028)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/agents | List agent configs |
| GET | /v1/agents/{id}/config | Get agent config |
| POST | /v1/agents/executions | Create execution |
| GET | /v1/agents/executions/{id} | Get execution + steps |
| POST | /v1/agents/executions/{id}/cancel | Cancel execution |
| GET | /v1/agents/executions | List executions |
| POST | /v1/agents/approvals/{id} | Approve/reject step |
| GET | /v1/agents/executions/{id}/audit | Audit trail |

### Workflows (workflow-service :8029)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/workflows | List workflows |
| GET | /v1/workflows/{id} | Get workflow |
| POST | /v1/workflows | Create workflow |
| POST | /v1/workflows/{id}/execute | Execute workflow |
| GET | /v1/workflows/executions/{id} | Execution status |
| GET | /v1/workflows/executions | List executions |

### SSO (sso-service :8030)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/sso/{tenantId}/providers | List SSO providers |
| POST | /v1/sso/config | Create SSO config |
| PUT | /v1/sso/config/{id} | Update SSO config |
| GET | /v1/sso/saml/{tenantId}/login | Initiate SAML login |
| POST | /v1/sso/saml/{tenantId}/callback | SAML callback |
| GET | /v1/sso/oidc/{tenantId}/login | Initiate OIDC login |
| GET | /v1/sso/oidc/{tenantId}/callback | OIDC callback |
| POST | /v1/sso/ldap/{tenantId}/authenticate | LDAP auth |

### Integrations (integration-service :8031)
| Method | Path | Description |
|--------|------|-------------|
| GET | /v1/integrations | List integrations |
| POST | /v1/integrations | Create integration |
| PUT | /v1/integrations/{id} | Update integration |
| DELETE | /v1/integrations/{id} | Remove integration |
| POST | /v1/integrations/{id}/test | Test connection |
| POST | /v1/integrations/slack/events | Slack event handler |
| POST | /v1/integrations/slack/commands | Slack commands |
| POST | /v1/integrations/slack/interact | Slack interactive |
| GET | /v1/webhooks | List webhooks |
| POST | /v1/webhooks | Create webhook |
| PUT | /v1/webhooks/{id} | Update webhook |
| DELETE | /v1/webhooks/{id} | Remove webhook |
| GET | /v1/webhooks/{id}/deliveries | Delivery log |
| GET | /scim/v2/Users | SCIM list users |
| POST | /scim/v2/Users | SCIM create user |
| GET | /scim/v2/Users/{id} | SCIM get user |
| PATCH | /scim/v2/Users/{id} | SCIM update user |
| DELETE | /scim/v2/Users/{id} | SCIM deactivate |
| POST | /scim/v2/Bulk | SCIM bulk ops |

---

## Database Schema (13 migrations)

### Core Tables (V001-V002)
users, roles, departments, sessions, quota_tiers, personas, purposes, conversations, messages, message_feedback, conversation_memory, collections, collection_access, documents, document_chunks, dlp_patterns, security_events, user_risk_scores, audit_logs, usage_daily, user_usage_current, reports, report_schedules, bookmarks, bookmark_folders, shared_content, share_access_log, system_config

### Extended Tables (V003-V013)
feedback_aggregates, notifications, user_usage_stats, user_achievements, conversation_branches, long_term_memories, memory_summaries, tenants, subscriptions, invoices, usage_records, pricing_plans, agent_configs, agent_executions, execution_steps, agent_approvals, workflows, workflow_executions, sso_configurations, integrations, webhooks, webhook_deliveries
