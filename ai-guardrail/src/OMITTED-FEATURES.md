# KYRA AI Guardrail - Remaining Gaps

Last updated: 2026-04-13 (after Phase 1-5 implementation)

## Implementation Status: ~75% of documented features

### Fully Implemented
- 21 backend microservices (Java Spring Boot)
- 2 ML services (Python FastAPI) with advanced RAG, security ML, memory extraction
- 22 frontend pages with admin console, onboarding wizard
- Multi-tenancy with RLS policies
- Stripe billing with subscriptions/metering
- SSO (SAML/OIDC/LDAP)
- Slack/Teams/webhooks/SCIM integrations
- Agentic tool execution with planning
- Purpose workflow engine
- Kubernetes manifests, CI/CD, monitoring stack

### Remaining Gaps

#### 1. Multi-Modal Features (~0% implemented)
- Vision analysis (GPT-4V / Claude Vision integration)
- OCR engine (document text extraction)
- Speech-to-Text streaming (Whisper)
- Text-to-Speech streaming
- Multi-modal RAG (image + text embeddings)
- Audio upload/playback in frontend
- **Needs:** New vision-service, ocr-service, speech-service (Python)

#### 2. Advanced Frontend UX (~30% gap)
- Interactive tutorial / onboarding system
- Keyboard shortcuts framework
- Draft auto-save and recovery
- Message editing (edit sent messages)
- Simple mode toggle
- Persona auto-selection based on context
- Conversation full-text search UI (OpenSearch backend exists)
- Citation popover/detail modal
- Agent execution UI page
- Workflow builder UI page
- Billing/subscription management page
- Team management page
- Integration configuration page

#### 3. Testing & QA Framework (~10% implemented)
- Unit tests for all services
- Integration tests with TestContainers
- End-to-end tests (Playwright)
- Security penetration testing
- RAG quality evaluation pipeline
- Load/performance testing

#### 4. Compliance Implementation (~0% code)
- SOC 2 Type II controls automation
- GDPR data subject rights (export, delete, consent)
- HIPAA BAA handling and PHI controls
- ISO 27001 ISMS policies
- ISO 42001 AI risk management
- Compliance reporting and evidence collection

#### 5. Operational Tooling (~20% implemented)
- Operational runbooks
- Incident response procedures
- Backup and disaster recovery automation
- Cost monitoring and optimization
- Capacity planning tools
- Terraform / IaC for cloud deployment

#### 6. Minor Backend Gaps
- Offline Sync Service (queued messages when offline)
- Conversation Search Service (OpenSearch indexing/search - infra ready)
- Self-query in RAG (metadata filter extraction from natural language)
- Parent-child chunk retrieval in RAG
- Fine-tuned prompt injection classifier model (currently uses zero-shot LLM)

### Priority Recommendations

1. **Multi-modal** - Highest differentiation value
2. **Testing framework** - Required for production confidence
3. **Missing frontend pages** - Agent/workflow/billing UI
4. **Compliance** - Required for enterprise sales
5. **Operational tooling** - Required for production operations
