# CLAUDE.md - KYRA AI Guardrail Source Code

## Project

Enterprise AI security gateway. 545 files across 21 microservices (Java 21 Spring Boot), 2 ML services (Python FastAPI), and a Next.js 14 frontend.

## Key Documentation

- **[DEVELOPER-GUIDE.md](./DEVELOPER-GUIDE.md)** - Architecture, all 21 services, 150+ API endpoints, database schema
- **[CODING-CONVENTIONS.md](./CODING-CONVENTIONS.md)** - Naming conventions, code patterns, templates for all layers
- **[ADDING-FEATURES.md](./ADDING-FEATURES.md)** - Step-by-step guide for adding services, endpoints, pages

## Service Registry

### Backend (Java 21 / Spring Boot 3.3.5)
```
common/            - Shared DTOs, exceptions, JWT, audit
api-gateway/  8080 - Routing, auth filter, rate limit, tenant context
auth-service/ 8081 - Login, MFA, JWT, signup, onboarding
chat-service/ 8082 - Conversations, SSE streaming, personas
security-svc/ 8083 - DLP, threat detection, risk scoring
bookmark-svc/ 8014 - Bookmarks, folders, tags, search
feedback-svc/ 8015 - Ratings, trends, aggregation, export
branching-svc/8017 - Conversation branches, compare, merge
sharing-svc/  8018 - Share links, email, view tracking
insights-svc/ 8019 - Usage stats, achievements, productivity
analytics-svc/8084 - Real-time tracking, quota enforcement
notif-svc/    8085 - In-app, email, alerts
memory-svc/   8023 - LTM/STM, extraction, consolidation
tenant-svc/   8026 - Multi-tenancy, RLS, lifecycle
billing-svc/  8027 - Stripe, subscriptions, invoices
agent-svc/    8028 - Tool execution, planning, approvals
workflow-svc/ 8029 - Purpose workflows, structured outputs
sso-svc/      8030 - SAML, OIDC, LDAP
integr-svc/   8031 - Slack, Teams, webhooks, SCIM
```

### ML Services (Python 3.11 / FastAPI)
```
rag-service/  8001 - Document ingestion, hybrid search, reranking, HyDE, citations
ml-service/   8002 - LLM inference (OpenAI/Anthropic/Azure), security ML, memory extraction, planning
```

### Frontend (Next.js 14 / React 18)
```
22 pages: login, signup, onboarding (5-step), chat, documents, dashboard,
          settings, bookmarks, history, analytics, admin (5 pages), 404
32 components, 6 Zustand stores
```

### Infrastructure
```
PostgreSQL:5432  Redis:6379  Milvus:19530  OpenSearch:9200  MinIO:9000
Nginx:80  Prometheus:9090  Grafana:3001  Loki:3100
13 DB migrations, 11 K8s manifests, CI/CD pipeline
```

## Conventions (must follow)

- **Java**: Package `com.kyra.<service>.<layer>`, Lombok, `@Transactional` on services
- **Python**: Pydantic models, async/await, type hints everywhere
- **Frontend**: Zustand stores, shadcn/ui, `"use client"` directive
- **API paths**: `/v1/<resource>`, standard REST verbs
- **Response**: `ApiResponse.ok(data)` / `ApiResponse.error(code, msg)`
- **Errors**: Throw `NotFoundException`, `UnauthorizedException`, etc.
- **DB migrations**: `V<NNN>__<description>.sql`, never modify existing
- **Docker**: Multi-stage build, non-root user, health checks
- **Gateway**: All services registered in GatewayConfig.java routes

## Git

- Never commit directly to main - branch and merge
- Commit format: `v1.0: <type>(<scope>): <description>`
- NO Claude attribution in commits
- Edit -> commit -> push -> deploy (never skip commit)
