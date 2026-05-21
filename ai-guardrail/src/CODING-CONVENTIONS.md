# KYRA AI Guardrail - Coding Conventions

This document defines the coding standards and patterns used across the project. All new features MUST follow these conventions to maintain consistency.

---

## 1. Naming Conventions

### Java (Backend Services)

| Element | Convention | Example |
|---------|-----------|---------|
| Package | `com.kyra.<service>.<layer>` | `com.kyra.auth.controller` |
| Class - Controller | `<Resource>Controller` | `BookmarkController` |
| Class - Service | `<Domain>Service` | `BookmarkService` |
| Class - Repository | `<Entity>Repository` | `BookmarkRepository` |
| Class - Entity | Domain noun (no suffix) | `Bookmark` |
| Class - DTO Request | `<Action><Resource>Request` | `CreateBookmarkRequest` |
| Class - DTO Response | `<Resource>DTO` or `<Resource>Response` | `BookmarkDTO` |
| Class - Client | `<Service>Client` | `ChatServiceClient` |
| Class - Filter | `<Purpose>Filter` | `RateLimitFilter` |
| Class - Config | `<Purpose>Config` | `SecurityConfig` |
| Enum | PascalCase | `Severity`, `MessageRole` |
| Enum values | UPPER_SNAKE | `ACTIVE`, `HIGH`, `USER` |
| Method | camelCase, verb-first | `findByUserId`, `scanContent` |
| Field | camelCase | `conversationId`, `lastMessageAt` |
| Constant | UPPER_SNAKE | `MAX_FAILED_ATTEMPTS` |
| DB column | snake_case | `conversation_id`, `last_message_at` |

### Python (ML Services)

| Element | Convention | Example |
|---------|-----------|---------|
| Module | snake_case | `embedding.py`, `search.py` |
| Class | PascalCase | `EmbeddingService`, `ModelRouter` |
| Function/Method | snake_case | `embed_texts`, `search` |
| Variable | snake_case | `chunk_size`, `min_score` |
| Constant | UPPER_SNAKE | `DEFAULT_MODEL` |
| Pydantic model | PascalCase | `SearchRequest`, `CollectionResponse` |
| API router prefix | `/v1/<resource>` | `/v1/collections` |

### TypeScript (Frontend)

| Element | Convention | Example |
|---------|-----------|---------|
| Component | PascalCase function | `ChatContainer`, `MessageBubble` |
| Store | `use<Name>Store` | `useAuthStore`, `useChatStore` |
| Interface | PascalCase | `User`, `Conversation`, `Message` |
| Hook | `use<Name>` | `useStreaming` |
| File - component | PascalCase.tsx | `ChatInput.tsx` |
| File - store | kebab-case.ts | `auth-store.ts` |
| File - utility | kebab-case.ts | `api.ts`, `utils.ts` |
| CSS class | Tailwind utility | `bg-background text-foreground` |

---

## 2. Java Backend Patterns

### 2.1 Controller Pattern

```java
@RestController
@RequestMapping("/v1/<resource>")
@RequiredArgsConstructor
@Slf4j
public class <Resource>Controller {

    private final <Resource>Service service;

    @GetMapping
    public ResponseEntity<PagedResponse<ResourceDTO>> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            ServerWebExchange exchange) {
        UserContext user = getUserContext(exchange);
        // ...
    }

    @PostMapping
    public ResponseEntity<ResourceDTO> create(
            @Valid @RequestBody CreateResourceRequest request,
            ServerWebExchange exchange) {
        // ...
    }

    @GetMapping("/{id}")
    public ResponseEntity<ResourceDTO> getById(
            @PathVariable UUID id,
            ServerWebExchange exchange) {
        // ...
    }

    @PatchMapping("/{id}")
    public ResponseEntity<ResourceDTO> update(
            @PathVariable UUID id,
            @Valid @RequestBody UpdateResourceRequest request,
            ServerWebExchange exchange) {
        // ...
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID id,
            ServerWebExchange exchange) {
        // ...
        return ResponseEntity.noContent().build();
    }

    private UserContext getUserContext(ServerWebExchange exchange) {
        // Extract from X-User-Id, X-User-Email, X-User-Role headers
    }
}
```

### 2.2 Service Pattern

```java
@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class <Resource>Service {

    private final <Resource>Repository repository;
    private final StringRedisTemplate redisTemplate;  // if caching needed

    public ResourceDTO create(UUID userId, CreateResourceRequest request) {
        // 1. Validate business rules
        // 2. Build entity
        // 3. Save
        // 4. Return DTO
    }

    @Transactional(readOnly = true)
    public Page<ResourceDTO> findByUser(UUID userId, Pageable pageable) {
        return repository.findByUserId(userId, pageable)
                .map(this::toDTO);
    }

    private ResourceDTO toDTO(ResourceEntity entity) {
        return ResourceDTO.builder()
                .id(entity.getId())
                // ... map fields
                .build();
    }
}
```

### 2.3 Entity Pattern

```java
@Entity
@Table(name = "<table_name>")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class <Entity> {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = Instant.now();
        updatedAt = Instant.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = Instant.now();
    }
}
```

### 2.4 DTO Pattern

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class CreateResourceRequest {

    @NotBlank(message = "Name is required")
    private String name;

    private String description;

    @NotNull(message = "Type must not be null")
    private ResourceType type;
}
```

### 2.5 Repository Pattern

```java
@Repository
public interface <Entity>Repository extends JpaRepository<<Entity>, UUID> {

    Page<<Entity>> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    Optional<<Entity>> findByIdAndUserId(UUID id, UUID userId);

    @Query("SELECT e FROM Entity e WHERE e.userId = :userId AND e.status = :status")
    List<<Entity>> findByUserAndStatus(@Param("userId") UUID userId, @Param("status") Status status);

    @Modifying
    @Query("DELETE FROM Entity e WHERE e.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);
}
```

### 2.6 WebClient (Service-to-Service) Pattern

```java
@Component
@Slf4j
public class <Service>Client {

    private final WebClient webClient;

    public <Service>Client(@Value("${services.<name>.url}") String serviceUrl,
                           WebClient.Builder builder) {
        this.webClient = builder.baseUrl(serviceUrl).build();
    }

    public Mono<ResponseType> callEndpoint(RequestType request) {
        return webClient.post()
                .uri("/v1/<endpoint>")
                .contentType(MediaType.APPLICATION_JSON)
                .bodyValue(request)
                .retrieve()
                .bodyToMono(ResponseType.class)
                .onErrorResume(e -> {
                    log.error("Service call failed: {}", e.getMessage());
                    return Mono.just(fallbackResponse());
                });
    }
}
```

### 2.7 Error Handling

All services inherit from `common` module:

```java
// Throwing errors in services:
throw new NotFoundException("Bookmark", bookmarkId);      // 404
throw new UnauthorizedException("Invalid credentials");    // 401
throw new ForbiddenException("Insufficient permissions");  // 403
throw new ValidationException("Invalid input", errorMap);  // 400

// Handled automatically by GlobalExceptionHandler → ApiResponse.error(ErrorResponse)
```

### 2.8 API Response Envelope

All responses use the standard wrapper from `common`:

```json
// Success
{
  "success": true,
  "data": { ... },
  "meta": { "requestId": "...", "timestamp": "..." }
}

// Error
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Bookmark not found: 123",
    "requestId": "abc-def",
    "timestamp": "2026-04-13T..."
  }
}
```

---

## 3. Python ML Service Patterns

### 3.1 FastAPI Router Pattern

```python
from fastapi import APIRouter, Depends, HTTPException, status
from src.models.schemas import ResourceCreate, ResourceResponse

router = APIRouter(prefix="/v1/<resource>", tags=["<resource>"])

@router.get("/", response_model=list[ResourceResponse])
async def list_resources(
    user_id: str = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_session),
):
    # ...

@router.post("/", response_model=ResourceResponse, status_code=status.HTTP_201_CREATED)
async def create_resource(
    request: ResourceCreate,
    user_id: str = Header(alias="X-User-Id"),
    session: AsyncSession = Depends(get_session),
):
    # ...
```

### 3.2 Pydantic Schema Pattern

```python
from pydantic import BaseModel, Field
from datetime import datetime

class ResourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

class ResourceResponse(BaseModel):
    id: str
    name: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
```

### 3.3 Service Class Pattern

```python
class ResourceService:
    def __init__(self, session_factory, embedding_service=None):
        self.session_factory = session_factory
        self.embedding_service = embedding_service

    async def create(self, data: ResourceCreate, user_id: str) -> ResourceResponse:
        async with self.session_factory() as session:
            entity = ResourceModel(**data.model_dump(), user_id=user_id)
            session.add(entity)
            await session.commit()
            await session.refresh(entity)
            return ResourceResponse.model_validate(entity)
```

### 3.4 Configuration Pattern

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://kyra:kyra@localhost:5432/kyra"
    REDIS_URL: str = "redis://localhost:6379/0"
    CUSTOM_SETTING: int = 100

    model_config = {"env_prefix": "SERVICE_", "env_file": ".env", "extra": "ignore"}

settings = Settings()
```

---

## 4. Frontend Patterns

### 4.1 Page Component Pattern

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";

export default function ResourcePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) router.push("/login");
  }, [isAuthenticated, router]);

  return (
    <div className="flex flex-col h-full">
      {/* Page content */}
    </div>
  );
}
```

### 4.2 Component Pattern

```tsx
"use client";

import { cn } from "@/lib/utils";

interface ResourceCardProps {
  resource: Resource;
  onSelect?: (id: string) => void;
  className?: string;
}

export function ResourceCard({ resource, onSelect, className }: ResourceCardProps) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-4", className)}
      onClick={() => onSelect?.(resource.id)}
    >
      <h3 className="font-semibold">{resource.name}</h3>
      <p className="text-sm text-muted-foreground">{resource.description}</p>
    </div>
  );
}
```

### 4.3 Zustand Store Pattern

```typescript
import { create } from "zustand";
import { api } from "@/lib/api";
import type { Resource } from "@/types";

interface ResourceState {
  items: Resource[];
  isLoading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  create: (data: Partial<Resource>) => Promise<void>;
  delete: (id: string) => Promise<void>;
}

export const useResourceStore = create<ResourceState>((set, get) => ({
  items: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.get<Resource[]>("/resources");
      set({ items: data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  create: async (data) => {
    const resource = await api.post<Resource>("/resources", data);
    set({ items: [...get().items, resource] });
  },

  delete: async (id) => {
    await api.delete(`/resources/${id}`);
    set({ items: get().items.filter((r) => r.id !== id) });
  },
}));
```

### 4.4 API Client Usage

```typescript
import { api } from "@/lib/api";

// Typed GET
const conversations = await api.get<Conversation[]>("/conversations");

// Typed POST
const message = await api.post<ChatResponse>("/chat/message", {
  conversationId: id,
  message: text,
  personaId: "general",
});

// Streaming (SSE)
import { useStreaming } from "@/lib/streaming";
const { startStream, stopStream } = useStreaming();
startStream("/chat/stream", { message: text }, {
  onToken: (token) => appendToMessage(token),
  onComplete: (response) => finalizeMessage(response),
  onError: (error) => showError(error),
});
```

### 4.5 UI Component Pattern (shadcn-style)

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        success: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
        warning: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
        destructive: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
```

---

## 5. Database Conventions

### 5.1 Migration Files

- Location: `database/migrations/`
- Naming: `V<NNN>__<description>.sql` (Flyway convention)
- Example: `V003__add_bookmarks_tags_index.sql`
- Always add new tables/columns via migration, never modify existing migrations

### 5.2 Table Design Rules

- Primary key: `id UUID PRIMARY KEY DEFAULT uuid_generate_v4()`
- Timestamps: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Foreign keys: With `ON DELETE CASCADE` or `ON DELETE SET NULL` as appropriate
- Enums: Defined as PostgreSQL types (`CREATE TYPE ... AS ENUM (...)`)
- JSONB: For flexible/nested data (metadata, preferences, guardrails)
- Indexes: Named `idx_<table>_<columns>`, add for FK columns and frequent query patterns
- Soft delete: Use status enum (`active`, `archived`, `deleted`) instead of physical delete

### 5.3 Column Naming

| Pattern | Example |
|---------|---------|
| Foreign key | `user_id`, `conversation_id` |
| Boolean | `is_active`, `is_pinned`, `mfa_enabled` |
| Count | `message_count`, `chunk_count` |
| Timestamp | `created_at`, `last_login_at`, `expires_at` |
| JSONB | `metadata`, `preferences`, `guardrails` |

---

## 6. Docker & Configuration

### 6.1 Service Configuration

- Environment variables follow pattern: `${VAR_NAME:-default_value}`
- Docker profile: `application-docker.yml` overrides `application.yml`
- Secrets: Never hardcode, always use env vars
- Service discovery: Direct URLs via environment (`CHAT_SERVICE_URL`, `ML_SERVICE_URL`)

### 6.2 Health Checks

Every service must expose a health endpoint:
- Java: `/actuator/health` (Spring Boot Actuator)
- Python: `/health` (custom FastAPI endpoint)
- Frontend: Next.js built-in health

### 6.3 New Service Checklist (Docker)

1. Create `Dockerfile` following multi-stage pattern
2. Add service to `docker-compose.yml`
3. Assign unique port
4. Add health check
5. Wire environment variables
6. Add to `kyra-network`
7. Add dependency ordering (`depends_on`)

---

## 7. Security Patterns

### 7.1 Authentication Flow

```
Client → API Gateway (JWT validation) → Service (header-based user context)
```

- Gateway validates JWT, adds `X-User-Id`, `X-User-Email`, `X-User-Role`, `X-User-Department` headers
- Backend services trust these headers (no re-validation needed)
- Internal service-to-service calls skip auth (network isolation)

### 7.2 Request Flow Through DLP

```
User Input → Security Service (DLP scan) → Process → Security Service (output scan) → Response
```

### 7.3 Redis Key Patterns

| Key | Purpose | TTL |
|-----|---------|-----|
| `blacklist:token:<jti>` | Revoked JWT tokens | Token remaining lifetime |
| `rate_limit:<userId>:<window>` | Rate limiting counters | Window duration |
| `dlp:patterns:active` | Cached DLP patterns | 5 minutes |
| `risk:user:<userId>` | Cached risk score | 5 minutes |
| `mfa:challenge:<token>` | MFA challenge | 5 minutes |

---

## 8. Git & Branching

- **Never commit directly to main** - always branch and merge
- Branch naming: `feature/<name>`, `fix/<name>`, `refactor/<name>`
- Commit message: imperative mood, explain *why* not *what*
- Always commit before deploying (edit → commit → push → deploy)
