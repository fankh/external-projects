# KYRA AI Guardrail - API Reference

Base URL: https://kyra-guardrail-dev.seekerslab.com/api/v1
Auth: Bearer token via POST /api/v1/auth/login

## Authentication
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /auth/login | - | Login (returns JWT) |
| POST | /auth/mfa/verify | - | MFA verification |
| POST | /auth/mfa/setup | Bearer | Generate TOTP secret + QR |
| POST | /auth/mfa/enable | Bearer | Enable MFA with backup codes |
| POST | /auth/mfa/disable | Bearer | Disable MFA |
| POST | /auth/mfa/backup-codes/regenerate | Bearer | New backup codes |
| POST | /auth/refresh | - | Refresh tokens |
| POST | /auth/logout | Bearer | Logout |
| GET | /auth/me | Bearer | Current user |

## Admin Users
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /admin/users | Admin | List all users |
| POST | /admin/users | Admin | Create user |
| PUT | /admin/users/{id}/role | Admin | Change role |
| POST | /admin/users/{id}/suspend | Admin | Suspend user |
| POST | /admin/users/{id}/activate | Admin | Activate user |

## Compliance
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /compliance/status | Admin | SOC2/GDPR/HIPAA scores |
| GET | /audit/verify | Admin | Chain integrity check |
| POST | /audit/{id}/legal-hold | Admin | Set legal hold |
| GET | /audit-search | Admin | OpenSearch query |
| POST | /privacy/requests | Bearer | Create DSR |
| POST | /privacy/requests/{id}/verify | Admin | Verify identity |
| POST | /privacy/requests/{id}/fulfill | Admin | Execute DSR |
| GET | /privacy/requests/{id}/export | Bearer | Download export |
| POST | /breach/incidents | Admin | Report breach |
| POST | /breach/incidents/{id}/notify-authority | Admin | Notify DPA |
| POST | /phi/scan | Bearer | PHI detection + masking |
| GET | /processing-register | Admin | Art.30 register |

## Permissions
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /permissions/check | Bearer | Evaluate permission |
| GET | /permissions/grants | Admin | List grants |
| POST | /permissions/grants | Admin | Create grant |
| DELETE | /permissions/grants/{id} | Admin | Revoke grant |

## Security
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /uba/top-risk | Admin | Top risk users |
| GET | /uba/anomalies | Admin | Recent anomalies |
| POST | /uba/observe | Internal | Record login observation |
| POST | /uba/analyze-malicious/{userId} | Admin | Malicious pattern analysis |
| GET | /dlp/whitelist | Admin | DLP whitelist rules |
| POST | /dlp/whitelist/evaluate | - | Context-aware DLP check |
| GET | /keys/{tenantId} | Admin | Encryption keys |
| POST | /keys/{tenantId}/rotate | Admin | Rotate key |

## Feature Flags
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /flags | Admin | List all flags |
| PUT | /flags/{id} | Admin | Toggle/update flag |
| GET | /flags/evaluate?key=X&tenantId=Y | - | Evaluate flag |

## Billing
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /billing/plans | Bearer | List plans |
| GET | /billing/subscriptions/{tenantId} | Bearer | Current subscription |
| POST | /billing/subscriptions/{id}/pause | Bearer | Pause subscription |
| POST | /billing/subscriptions/{id}/resume | Bearer | Resume |
| GET | /billing/usage/{tenantId} | Bearer | Usage stats |
| GET | /billing/invoices/{tenantId} | Bearer | Invoice list |
| GET | /billing/payment-methods/{tenantId} | Bearer | Payment methods |

## SSO
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /sso/{tenantId}/providers | Bearer | List SSO configs |
| POST | /sso/config | Admin | Create provider |
| DELETE | /sso/config/{id} | Admin | Delete provider |

## ML Service (port 8002)
| Method | Path | Description |
|---|---|---|
| POST | /v1/quality/score | 6-dimension quality scoring |
| POST | /v1/quality/verify-citations | Citation verification |
| POST | /v1/cache/lookup | Semantic cache lookup |
| POST | /v1/cache/store | Cache a response |
| GET | /v1/cache/stats | Cache stats |
| POST | /v1/sentiment/analyze | Sentiment analysis |
| POST | /v1/query/optimize | Query classification + rewrite |
| POST | /v1/persona/recommend | Persona auto-selection |
| POST | /v1/injection/detect | Prompt injection L3 |
| POST | /v1/summarize/conversation | Conversation summarizer |
| POST | /v1/autoscale/forecast | Predictive autoscaling |

## RAG Service (port 8001)
| Method | Path | Description |
|---|---|---|
| POST | /v1/rag/search | Vector similarity search |
| POST | /v1/rag/rerank | Cohere/local reranking |
| POST | /v1/rag/self-query | Metadata filter extraction |
| POST | /v1/connectors/s3/sync | S3 connector |
| POST | /v1/connectors/rest/sync | REST API connector |
| POST | /v1/connectors/confluence/sync | Confluence connector |
| POST | /v1/connectors/sharepoint/sync | SharePoint connector |
| POST | /v1/connectors/gdrive/sync | Google Drive connector |
| POST | /v1/connectors/smb/sync | SMB/CIFS connector |
| POST | /v1/connectors/nfs/sync | NFS mount connector |
| POST | /v1/connectors/sftp/sync | SFTP connector |
| POST | /v1/connectors/azure-blob/sync | Azure Blob connector |
| POST | /v1/connectors/gcs/sync | Google Cloud Storage |
| GET | /v1/connectors/runs | Sync run history |

## Monitoring
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /monitoring/alerts | Admin | Live Prometheus alerts |
| GET | /monitoring/rules | Admin | Alert rules |

## Workflow Engine (port 8029)
| Method | Path | Description |
|---|---|---|
| GET | /v1/workflow-engine | List definitions |
| POST | /v1/workflow-engine | Create workflow |
| POST | /v1/workflow-engine/{id}/run | Execute workflow |
| GET | /v1/workflow-engine/{id}/runs | Run history |

## Events (Event Store)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /events | Bearer | Append domain event |
| GET | /events/replay/{type}/{id} | Bearer | Replay aggregate |
| GET | /events/recent | Bearer | Recent events |
