# KYRA AI Guardrail - How to Add New Features

Step-by-step guide for adding features while maintaining codebase consistency.

---

## Adding a New Backend Service (Java)

### Example: Adding a Notification Service (port 8084)

#### Step 1: Database Migration

Create `database/migrations/V003__add_notifications.sql`:

```sql
CREATE TYPE notification_type AS ENUM ('info', 'warning', 'security', 'system');
CREATE TYPE notification_status AS ENUM ('unread', 'read', 'dismissed');

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status notification_status NOT NULL DEFAULT 'unread',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE status = 'unread';
```

#### Step 2: Create Service Directory

```
backend/notification-service/
├── pom.xml
├── Dockerfile
└── src/main/
    ├── java/com/kyra/notification/
    │   ├── NotificationServiceApplication.java
    │   ├── config/
    │   │   └── SecurityConfig.java
    │   ├── controller/
    │   │   └── NotificationController.java
    │   ├── service/
    │   │   └── NotificationService.java
    │   ├── model/
    │   │   └── Notification.java
    │   ├── repository/
    │   │   └── NotificationRepository.java
    │   └── dto/
    │       ├── NotificationDTO.java
    │       └── CreateNotificationRequest.java
    └── resources/
        ├── application.yml
        └── application-docker.yml
```

#### Step 3: pom.xml

```xml
<parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.5</version>
</parent>

<groupId>com.kyra</groupId>
<artifactId>notification-service</artifactId>
<version>1.0.0</version>

<properties>
    <java.version>21</java.version>
</properties>

<dependencies>
    <!-- Always include these starters -->
    <dependency>spring-boot-starter-web</dependency>
    <dependency>spring-boot-starter-data-jpa</dependency>
    <dependency>spring-boot-starter-data-redis</dependency>
    <dependency>spring-boot-starter-validation</dependency>
    <dependency>spring-boot-starter-actuator</dependency>
    <dependency>postgresql</dependency>
    <dependency>lombok</dependency>
</dependencies>
```

#### Step 4: application.yml

```yaml
server:
  port: 8084

spring:
  application:
    name: notification-service
  datasource:
    url: jdbc:postgresql://localhost:5432/kyra
    username: kyra
    password: ${DB_PASSWORD:kyra_secret}
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: 6379
      password: ${REDIS_PASSWORD:}

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
```

#### Step 5: Entity, Repository, DTO, Service, Controller

Follow the patterns exactly as defined in CODING-CONVENTIONS.md.

#### Step 6: Dockerfile

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build /app/target/*.jar app.jar
RUN chown -R appuser:appgroup /app
USER appuser
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "app.jar"]
```

#### Step 7: Register in docker-compose.yml

```yaml
notification-service:
  build:
    context: ./backend/notification-service
    dockerfile: Dockerfile
  container_name: kyra-notification-service
  ports:
    - "8084:8084"
  environment:
    SPRING_PROFILES_ACTIVE: docker
    SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/kyra
    SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-kyra}
    SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-kyra_secret}
    REDIS_HOST: redis
    REDIS_PASSWORD: ${REDIS_PASSWORD:-kyra_redis}
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  networks:
    - kyra-network
```

#### Step 8: Add Route in API Gateway

In `api-gateway/.../config/GatewayConfig.java`, add:

```java
.route("notification-service", r -> r
    .path("/api/v1/notifications/**")
    .filters(f -> f.stripPrefix(2))
    .uri(notificationServiceUrl))
```

Add env var `NOTIFICATION_SERVICE_URL` to gateway's docker-compose entry.

#### Step 9: Frontend Integration

1. Add types in `frontend/src/types/index.ts`
2. Add API calls in store or component
3. Add page/component as needed

---

## Adding a New API Endpoint to Existing Service

### Example: Adding `POST /v1/conversations/{id}/export` to Chat Service

#### Step 1: Create DTO

```java
// dto/ExportConversationRequest.java
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExportConversationRequest {
    @NotNull
    private ExportFormat format;  // JSON, MARKDOWN, PDF

    private boolean includeMetadata;
}
```

#### Step 2: Add Service Method

```java
// In ConversationService.java
public byte[] exportConversation(UUID userId, UUID conversationId, ExportFormat format) {
    Conversation conv = repository.findById(conversationId)
            .orElseThrow(() -> new NotFoundException("Conversation", conversationId));
    if (!conv.getUserId().equals(userId)) {
        throw new ForbiddenException("Not your conversation");
    }
    List<Message> messages = messageRepository.findByConversationIdOrderByCreatedAt(conversationId);
    return switch (format) {
        case JSON -> exportAsJson(conv, messages);
        case MARKDOWN -> exportAsMarkdown(conv, messages);
        case PDF -> exportAsPdf(conv, messages);
    };
}
```

#### Step 3: Add Controller Endpoint

```java
// In ConversationController.java
@PostMapping("/{id}/export")
public ResponseEntity<byte[]> exportConversation(
        @PathVariable UUID id,
        @Valid @RequestBody ExportConversationRequest request,
        ServerWebExchange exchange) {
    UserContext user = getUserContext(exchange);
    byte[] data = conversationService.exportConversation(user.getUserId(), id, request.getFormat());
    String contentType = request.getFormat() == ExportFormat.PDF
            ? "application/pdf" : "application/octet-stream";
    return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"conversation." + request.getFormat().name().toLowerCase() + "\"")
            .contentType(MediaType.parseMediaType(contentType))
            .body(data);
}
```

#### Step 4: Update Frontend

```typescript
// In chat-store.ts or direct API call
export async function exportConversation(id: string, format: "json" | "markdown" | "pdf") {
  const blob = await api.post<Blob>(`/conversations/${id}/export`, { format }, { responseType: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `conversation.${format}`;
  a.click();
}
```

---

## Adding a New Python ML Service Endpoint

### Example: Adding `/v1/summarize` to ML Service

#### Step 1: Add Schema

```python
# In models/schemas.py
class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=1)
    max_length: int = Field(default=500, ge=50, le=2000)
    style: str = Field(default="concise", pattern="^(concise|detailed|bullet_points)$")

class SummarizeResponse(BaseModel):
    summary: str
    original_length: int
    summary_length: int
    model: str
```

#### Step 2: Add Route

```python
# In api/completions.py or new api/summarize.py
@router.post("/v1/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest):
    llm = app.state.llm_service
    prompt = f"Summarize the following text in a {request.style} manner...\n\n{request.text}"
    result = await llm.generate(CompletionRequest(
        messages=[{"role": "user", "content": prompt}],
        model="gpt-4o-mini",
        max_tokens=request.max_length,
        temperature=0.3,
    ))
    return SummarizeResponse(
        summary=result.content,
        original_length=len(request.text),
        summary_length=len(result.summary),
        model=result.model,
    )
```

#### Step 3: Register Router (if new file)

```python
# In main.py
from src.api.summarize import router as summarize_router
app.include_router(summarize_router)
```

---

## Adding a New Frontend Page

### Example: Adding a Settings page

#### Step 1: Create Page

```
frontend/src/app/(app)/settings/page.tsx
```

```tsx
"use client";

import { useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  const { user } = useAuthStore();
  // ...
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Form fields */}
        </CardContent>
      </Card>
    </div>
  );
}
```

#### Step 2: Add to Sidebar Navigation

In `components/layout/Sidebar.tsx`, add to the nav items array:

```typescript
{ id: "settings", label: "Settings", icon: Settings, href: "/settings" }
```

#### Step 3: Add Types (if needed)

In `types/index.ts`:

```typescript
export interface UserSettings {
  profile: { displayName: string; email: string; avatar?: string };
  preferences: { theme: "light" | "dark" | "system"; language: string; timezone: string };
  notifications: { emailEnabled: boolean; pushEnabled: boolean };
}
```

---

## Adding a New DLP Pattern

No code change needed - insert into the database:

```sql
-- V004__add_custom_dlp_pattern.sql
INSERT INTO dlp_patterns (name, description, category, pattern, severity, action) VALUES
    ('Internal Project Code', 'Internal project code names', 'intellectual_property',
     '(?:PROJECT|CODENAME)\s*[-:]?\s*[A-Z]{2,}[-_][A-Z0-9]+', 'high', 'redact');
```

The Security Service auto-loads active patterns from the database (cached in Redis for 5 minutes).

---

## Adding a New AI Persona

Insert into the database:

```sql
-- V005__add_compliance_persona.sql
INSERT INTO personas (id, name, description, icon, color, category, system_prompt, guardrails, display_order) VALUES
    ('compliance', 'Compliance Officer', 'Regulatory compliance and audit guidance', 'ClipboardCheck', '#059669', 'professional',
     'You are KYRA Compliance Officer. Help with regulatory compliance questions, audit preparation, and policy review. Always cite specific regulations and standards.',
     '{"allowedTopics": ["compliance", "regulation", "audit", "governance"], "requireCitations": true, "temperature": 0.3, "maxTokens": 8192}',
     13);
```

The Chat Service reads personas from the database dynamically.

---

## Adding a New Agent Tool

Register in `agent-service/.../service/ToolRegistry.java`:

```java
tools.put("my_new_tool", ToolDefinition.builder()
    .name("my_new_tool")
    .description("Description for the planning LLM")
    .inputSchema(Map.of(
        "param1", "string - description",
        "param2", "integer - description"
    ))
    .requiresApproval(false)
    .build());
```

Then implement the tool execution in `AgentOrchestrator.executeStep()`.

---

## Adding a New Workflow Template

Insert into workflows table:

```sql
INSERT INTO workflows (name, description, purpose_id, steps, output_format, status, is_system) VALUES
('risk_assessment', 'Automated risk assessment', 'analyze',
 '[{"step": 1, "type": "rag_search", "config": {"query": "{{input}}", "collections": ["security"]}},
   {"step": 2, "type": "llm_call", "config": {"prompt": "Analyze risks: {{step_1_result}}", "model": "gpt-4o"}},
   {"step": 3, "type": "output", "config": {"format": "markdown"}}]',
 'markdown', 'active', TRUE);
```

---

## Adding a New SSO Provider

1. Create config via API: `POST /v1/sso/config`
2. For SAML: provide metadata_url, entity_id, certificate
3. For OIDC: provide client_id, client_secret, authorization_url, token_url
4. For LDAP: provide host, port, base_dn, bind_dn in config JSONB

---

## Adding a New Integration (Slack/Teams/Webhook)

Via API: `POST /v1/integrations` with type and config:

```json
{
  "type": "slack",
  "name": "Engineering Slack",
  "config": {
    "bot_token": "xoxb-...",
    "signing_secret": "...",
    "channel_id": "C01234567"
  }
}
```

---

## Current Service Port Assignments

| Range | Services |
|-------|----------|
| 8080 | API Gateway |
| 8081-8085 | Core: Auth, Chat, Security, Analytics, Notification |
| 8001-8002 | ML: RAG, ML Inference |
| 8014-8019 | Features: Bookmark, Feedback, Branching, Sharing, Insights |
| 8023-8031 | Enterprise: Memory, Tenant, Billing, Agent, Workflow, SSO, Integration |
| 3000 | Frontend |
| Next available | 8032+ |

---

## Checklist for Any New Feature

- [ ] Database migration created (`V<NNN>__<description>.sql`)
- [ ] Entity/model created following naming conventions
- [ ] Repository with proper query methods
- [ ] DTOs with validation annotations
- [ ] Service with business logic and `@Transactional`
- [ ] Controller with proper HTTP methods and paths
- [ ] Error handling using `AppException` hierarchy
- [ ] Response wrapped in `ApiResponse` envelope
- [ ] API Gateway route added in `GatewayConfig.java` (if new service)
- [ ] Docker Compose service entry added (if new service)
- [ ] Tenant context filter updated (if tenant-scoped)
- [ ] Frontend types updated in `types/index.ts`
- [ ] Frontend store/API calls added
- [ ] Frontend page/component created
- [ ] K8s deployment manifest created (if new service)
- [ ] Prometheus scrape config updated (if new service)
- [ ] Health check endpoint working (`/actuator/health` or `/health`)
- [ ] Tested manually via API and UI
