# 과제 2 — EWACS AI Agent 코드 구현 계획 (v0.1)

| 항목 | 내용 |
|---|---|
| 상위 문서 | `IMPLEMENTATION_PLAN_과제2_EWACS_Agent_v0.1.md` (단계·게이트·리스크) |
| 이 문서의 범위 | **코드 레벨** — 저장소 구조, 패키지·파일 배치, 코드 규약, DB·이벤트 계약, 구현 순서(수직 슬라이스), 테스트 배치 |
| 작성일 | 2026-08-24 |
| 근거 | 아래 §1 의 실측 목록. 추측이 아니라 **CUPIA GitLab 의 현행 코드에서 읽어낸 관례**를 따른다 |

> **원칙** — 새 규약을 만들지 않는다. `cupia-customs-domain-template` 이 정한 골격과 `customs-risk` 가 실제로 굳혀 놓은 관례를 그대로 답습하고, 어긋나는 지점만 근거를 남기고 벗어난다.

---

## 1. 무엇을 읽고 이 계획을 세웠나

| 저장소 | 읽은 것 | 이 계획에 반영된 것 |
|---|---|---|
| `cupia-customs-domain-template` (77) | 전체 트리 106 파일 · `pom.xml` · `SampleServiceApplication` · `ActorProfileValidator` · `AdminProfileConfig` · `PackageDependencyTest` | 골격, 프로파일 격리 방식, pom 의존성 구성, ArchUnit 상속 |
| `customs-risk` (45) | 전체 트리 329 파일 · `SelectivityEvaluationEngine` · `DeclarationLodgedConsumer` · `SelectivityDecidedEvent` · `application-admin.yml` · `V043__outbox_infrastructure.sql` · 테스트 51건 배치 | **패키지 슬라이스 구조**, 엔진/서비스 분리, 이벤트 소비·발행, Outbox, Flyway 관례, 테스트 명명 |
| `cupia-ai-dev` (80) | `plugins/cupia-core/policies/prohibited-patterns.md` | **금지 패턴 정본 11개** (§3) |
| `customs-docs` (18) | `CLAUDE.md` 권위 서열 · 표준 문서 목록 | 명명 절차, Java/DB 표기 분리 |
| `cupia-framework` (3) | 모듈표 · BOM 2.3.0 | 사용할 프레임워크 모듈 |

---

## 2. 상위 계획 대비 변경 두 가지

패턴을 실측한 결과 v0.1 의 두 결정을 바꾼다.

| # | v0.1 | **변경** | 이유 |
|---|---|---|---|
| C-1 | 서비스명 `ewacs-agent-service` | **`ewacs-service`** / **`ewacs-mfe`** / federation `ewacsRemote` | 사내 전 도메인이 예외 없이 `<domain>-service` · `<domain>-mfe` · `<domain>Remote` 다(risk·tariff·clearance·portal). Jenkinsfile 의 `SERVICE_NAME`·`MFE_NAME`·changeset 필터가 이 규칙에 걸려 있다 |
| C-2 | Spring Modulith 로 내부 모듈 경계 강제 | **Modulith 를 쓰지 않는다.** `customs-risk` 와 동일하게 «순수 엔진 컴포넌트 + IO 담당 서비스» 관례 + ArchUnit 으로 간다 | Modulith 는 `cupia-edx-v1`(solutions) 한 곳의 선택이고, **customs 도메인 계열은 한 곳도 쓰지 않는다.** 우리가 들어갈 계열은 customs 다. 경계는 `CupiaArchitectureRules` 상속 + 엔진 순수성 규약으로 충분히 지켜지고 있으며(risk 의 `SelectivityEvaluationEngine` 이 실증), 계열에 없는 프레임워크를 들이면 리뷰어·후임자가 읽어야 할 규약이 하나 늘어난다 |

---

## 3. 코드 규약 — 금지 패턴 정본 (기계가 강제한다)

`cupia-ai-dev` 의 `cupia-core` 플러그인이 **PreToolUse hook 으로 Write/Edit 를 실제로 차단**한다. 착수 시 플러그인을 설치하고 시작한다.

```bash
claude plugin marketplace add https://git.cupia-framework.64bit.kr/cupia/solutions/cupia-ai-dev.git --scope project
claude plugin install cupia-core@cupia-ai-dev --scope project
claude plugin install cupia-backend@cupia-ai-dev --scope project
claude plugin install cupia-frontend@cupia-ai-dev --scope project
```

| ID | 심각도 | 금지 | 대신 |
|---|---|---|---|
| CUPIA-SEC-001 | **block** | MyBatis SQL 의 `${}` 치환 | `#{}` 바인딩. 동적 테이블·컬럼이 꼭 필요하면 코드에 allow-list 두고 검증 후 조립 |
| CUPIA-SEC-002a/b | warn | JWT secret · 비밀번호 하드코딩 | 환경변수 / K8s Secret |
| CUPIA-JAVA-001 | **block** | **JPA / Hibernate** | MyBatis + mapper XML. Entity 는 `MyBatisAuditableEntity` 상속 |
| CUPIA-JAVA-002 | **block** | **Java `record`** | `class` + Lombok `@Getter @Setter @EqualsAndHashCode` (+ Jackson·MyBatis 필요 시 `@NoArgsConstructor`) |
| CUPIA-JAVA-003 | **block** | `sealed` 타입 | 일반 interface / abstract class |
| CUPIA-JAVA-004 | **block** | Boolean 필드 `isXxx` 명명 | 과거분사 단독(`accepted`) / 목적어+과거분사 / 전치사구. DB 는 `VARCHAR(1) CHECK IN ('Y','N')`, JSON 은 true/false |
| CUPIA-JAVA-005 | warn | 물리 DELETE | `del_yn='Y'` UPDATE + `auditDelete(operator)`. 조회는 전부 `WHERE del_yn='N'` |
| CUPIA-FE-001 | warn | MFE 빌드에 Webpack | Vite federation. **shared 목록은 `@cupia/frontend-bom` 의 `createSharedDeps()` 가 생성** — 손으로 쓰지 않는다 |
| CUPIA-FE-002 | **block** | `ApiResponse.success()` | `ApiResponse.ok(data)` |
| CUPIA-WARN-002 | warn | 테이블 prefix 이탈 | `tb_<도메인>_`. 현행 도메인 코드: `clr crg rsm ptl com edx meta col` |

> **⚠ 주의 — `record` 에서 선례와 정본이 어긋난다.** `customs-risk` 는 이벤트·DTO 에 `record` 를 쓴다(`SelectivityDecidedEvent`, `DeclarationLodgedEvent`). 그러나 정본은 이를 **block** 으로 금지하며, **금지 사유가 정확히 우리 용례**다 — 「Jackson no-arg 생성자 부재. **cupia-streams Kafka payload 에서 역직렬화 실패가 실제로 보고된 후** 금지되었다」.
> **우리는 정본을 따른다** — 이벤트·DTO 전부 `class` + Lombok. risk 선례를 답습하지 않는다. 이 판단을 ADR 로 남겨 리뷰에서 재론되지 않게 한다.

> **⚠ `ewc` prefix 는 아직 등재되어 있지 않다.** CUPIA-WARN-002 의 도메인 코드 목록에 없으므로, 착수 시 `cupia-ai-dev` 정본에 `ewc` 를 추가 등재해야 한다. 등재 없이 시작하면 첫 마이그레이션부터 hook 경고가 뜬다. (`tancis-batch-ewc` 가 TANCIS 계보에서 EWACS 를 `ewc` 로 부른 근거다.)

### 3.1 관측된 코딩 관례 (hook 이 잡지 않지만 계열 전체가 지킨다)

- **모든 `.java` 파일 상단에 CUPIA 저작권 헤더.** Spotless 가 강제한다(`spotless-maven-plugin` 2.44.3, `config/` 의 라이선스 헤더).
- **Javadoc 을 한국어로, 길게 쓴다.** 특히 «왜 이렇게 했는가»와 «무엇을 못 가졌는가»를 클래스 Javadoc 에 남긴다. `SelectivityEvaluationEngine` 의 Javadoc 은 레거시 명세와 갈라진 지점, 구조적으로 판정 불가능한 축, 미구현 항목을 모두 적어 둔다 — 이 계열의 문서화 수준이 그렇다.
- **Lombok**: `@Slf4j`, `@RequiredArgsConstructor` 로 생성자 주입.
- **널 표기**: `org.jspecify.annotations.Nullable`.
- **로그 메시지도 한국어**로 쓴다.
- **DTO 접미사 고정**: `...SearchRequestDto` / `...SaveRequestDto` / `...UpdateRequestDto` / `...ResponseDto` / `...DetailResponseDto`.
- **Java 는 Full English camelCase, DB 는 약어 snake_case, 둘의 유일한 다리는 Mapper XML 의 `AS` alias.**
- **이름은 짓지 않고 조회한다** — `customs-cargo` 의 커밋 메시지가 이 계열의 표어다. 신규 entity·컬럼명은 Glossary → RKC/WCO DM/CUSDEC 매핑 → KCS 순으로 lookup 하고, 없으면 ADR 을 발행한다. **본 문서의 표·컬럼명은 전부 «형태 제안»이며 확정명이 아니다**(§5 참조).

---

## 4. 저장소 구조

`customs-risk` 의 배치를 그대로 따른다.

```
customs-ewacs/                          ← 저장소 (배치 위치는 §12-①에서 확정)
├── CLAUDE.md                           작업 규약 — .ai/ 를 가리키는 얇은 포인터
├── README.md
├── .ai/                                도구중립 규범 (프로젝트 오버라이드·예외 등록)
├── .claude/settings.json
├── .envrc                              direnv — .env 로드 (DB 자격증명)
├── ewacs-service/
│   ├── Dockerfile                      eclipse-temurin:25-jre-alpine
│   ├── Jenkinsfile                     SERVICE_NAME/IMAGE_NAME/DEPLOY_VALUES/changeset 필터
│   ├── pom.xml
│   └── src/
│       ├── main/java/cupia/customs/ewacs/
│       │   ├── EwacsServiceApplication.java     scanBasePackages = {common, config}
│       │   ├── admin/                           ← admin 프로파일에서만 활성
│       │   ├── common/                          ← 항상 활성 (Entity·Enum·공용 DTO)
│       │   └── config/                          ← 항상 활성
│       ├── main/resources/
│       │   ├── application{,-admin,-local,-dev,-kubernetes}.yml
│       │   ├── cupia/customs/ewacs/…/mapper/*.xml   ← Java 패키지 경로를 그대로 미러링
│       │   ├── db/migration/V0NN__*.sql
│       │   ├── messages/ewacs-messages{,_ko}.properties
│       │   └── spy.properties                   p6spy
│       └── test/
│           ├── java/cupia/customs/ewacs/
│           │   ├── architecture/PackageDependencyTest.java
│           │   └── admin/…/{XxxServiceTest,XxxMapperIT}.java
│           └── resources/{archunit.properties, db/*-fixture.sql}
└── ewacs-mfe/
    ├── Dockerfile · Jenkinsfile · nginx.conf · .npmrc
    ├── vite.config.{base,admin}.ts     ← trade 없음 (admin 전용 도메인)
    ├── locales/{ko-KR,en-US}/<feature>/*.json
    ├── scripts/{verify-bom.mjs,verify-i18n-coverage.mjs,verify-isolation.sh,verify-class-snapshot.mjs}
    └── src/
        ├── remote-entry-admin.tsx · routes/admin-routes.tsx
        ├── app/{create-shell-auth.tsx, shell-auth.ts, ui-labels.tsx}
        ├── features/admin/<feature>/{api,hooks,components,schema}/…
        └── lib/{i18n.ts, locale-resources*.ts}
```

### 4.1 서비스 패키지 슬라이스

`customs-risk` 의 슬라이스 규칙: **`admin/<업무영역>/<기능>/{controller,dto,mapper,service,integration/{consumer,event}}`**, 엔티티·enum 은 `common/<업무영역>/<기능>/{entity,enums}`.

```
admin/
├── ingest/                       수집 — 어댑터·배치
│   ├── replay/       {service,controller}       ReplayIngestService (§7 S1)
│   ├── ewacs/        {mapper,service}           EwacsMetricAdapter (§7 S11)
│   └── batch/        {config,job}               Spring Batch 잡 정의
├── feature/          {mapper,service}           FeatureBuilderService — 시간대·요일·계절 파생
├── threshold/                    동적 임계치
│   ├── controller/dto/mapper/    임계치 조회·수동 조정 화면 API
│   ├── service/ThresholdBaselineEngine.java     ★ 순수 컴포넌트
│   ├── service/ThresholdEvaluationService.java  IO 담당
│   └── integration/event/ThresholdBreachedEvent.java
├── prediction/       동일 구조    ForecastEngine.java (순수) + ForecastService
├── rca/              동일 구조    RootCauseEngine.java (순수) + RootCauseService
├── insight/          동일 구조    InsightPromptService · InsightGenerationService (vLLM 호출)
├── recommendation/   동일 구조    StaffingRecommendationEngine (순수) + Service
├── orchestrator/     service/     AgentOrchestrator — 감지→분석→보고→추천 라우팅
└── package-info.java
common/
├── metric/{entity,enums}         관측치·지표 정의
├── threshold/{entity,enums}
├── prediction/{entity,enums}
├── insight/{entity,enums}        프롬프트 템플릿·이력
└── package-info.java
config/
├── ActorProfileValidator.java    admin 하나만 허용하도록 축약
├── AdminProfileConfig.java       @ComponentScan + @MapperScan(admin)
├── MessageConfig.java · OpenApiConfig.java
└── package-info.java
```

> **엔진 순수성 규약(risk 실증)** — `*Engine` 은 `@Component` 이되 **DB·Kafka 를 모른다.** 입력은 「사실 객체」(risk 의 `DeclarationFacts` 에 해당하는 `MetricWindowFacts` 등)로 서비스가 미리 조회해 넘긴다. 그 결과 **엔진 단위테스트가 컨테이너 없이 전부 돈다** — 백테스트 하네스(§8.4)가 성립하는 근거이기도 하다.

---

## 5. DB 설계

### 5.1 규약

- 스키마 `ewc_db`, 계정 `ewc_user`, PostgreSQL 17. 전용 인스턴스를 띄우지 않고 공용 `cupia-customs-postgres` 에 스키마만 분리한다.
- 테이블 `tb_ewc_<약어>`, 컬럼은 약어 snake_case, 공통 감사 컬럼 `created_by/created_at/modified_by/modified_at/ver_no/del_yn`.
- Flyway `db/migration/V0NN__snake_case_description.sql` — 순번 연속, 한 마이그레이션 = 한 의도. risk 는 V001~V051 까지 이 방식으로 갔다.
- **논리삭제.** 물리 DELETE 금지(CUPIA-JAVA-005).
- Boolean 은 `VARCHAR(1) CHECK IN ('Y','N')`.

> **표·컬럼명은 미확정이다.** 아래는 **형태**만 제안한다. 실제 명명은 요건 설계 단계에서 Glossary → WCO DM/RKC/CUSDEC → KCS 순으로 조회해 확정하고, 신규 용어는 ADR 로 등재한다. 이 계열은 명명을 되돌리기 가장 비싼 결정으로 취급한다.

### 5.2 마이그레이션 순서 (형태 제안)

| 순번 | 내용 | 비고 |
|---|---|---|
| V001 | 지표 정의 카탈로그 — 어떤 업무 지표를 감시하는가 | 화면에서 관리 |
| V002 | 관측치 원장 — (지표, 관측시각, 값). 시계열의 원본 | 파티셔닝 여부는 규모 실측 후 |
| V003 | 피처 테이블 — 요일×시간대 버킷 집계, 계절 성분 | 물화 집계 |
| V004 | 임계치 기준선 — 버킷별 기준값·산포·유효기간 | 야간 배치가 갱신 |
| V005 | 고정 임계치 원장(AS-IS 룰 이관) | **비교 기준선.** 없으면 «대비 효과»를 잴 대상이 없다 |
| V006 | 판정 결과 + 적중 근거 | risk 의 `…_jdgn` + `…_jdgn_hit` 2단 구조 답습 |
| V007 | **Outbox 인프라** | **프레임워크가 테이블·컬럼명을 하드코딩한다.** `cupia-streams/schema/outbox-schema.sql` 을 그대로 옮긴다 — 이름을 조회하지 않는다. risk `V043` 과 동일 |
| V008 | 예측 결과·예측구간 | |
| V009 | RCA 진단 결과 | |
| V010 | 프롬프트 템플릿 + 변경 이력 | `ai-team/customs-docs` 패턴 답습 — `change_summary` 필수 |
| V011 | 인사이트 보고서 | |
| V012 | 대응 추천 결과 | |
| V013 | 코드 복제 테이블(`tb_ptl_*`) | **`customs-common` 구독용.** 이름·PK 는 발행 측과 정확히 일치해야 한다 |

### 5.3 참조 데이터 구독

`customs-common` + `cupia-data-replication` 을 쓴다. `application-admin.yml` 의 `sync-targets` 선언이 곧 **read 스택 활성화 스위치**다 — 빼면 조회 API 가 통째로 404 가 된다(risk 주석의 실측 경고). 조직·업체 마스터가 필요하다:

```yaml
cupia.streams.data-replication:
  source: ewacs-service-admin
  sync-targets:
    common-code:          { role: SUBSCRIBER, table: tb_ptl_comn_cd,  pk-column: comn_cd_id }
    organization:         { role: SUBSCRIBER, table: tb_ptl_itt_orgn, pk-column: itt_orgn_id }   # ⚠ 키는 institution-organization 이 아니라 organization
    company:              { role: SUBSCRIBER, table: tb_ptl_co,       pk-column: co_id }
```

> ⚠ risk 가 남긴 실측 경고 둘을 그대로 답습한다 — **키 표기가 발행 측 `dataType` 과 정확히 같아야 하고**(틀리면 이벤트가 조용히 버려진다), **`pk-column` 이 DDL 과 일치해야 한다**.

---

## 6. 이벤트 계약

### 6.1 토픽

risk 관례: `customs.<도메인>.<사건>.v<N>`, 소비 group 은 **서비스 전용**.

| 방향 | 토픽 | 용도 |
|---|---|---|
| 발행 | `customs.ewacs.threshold-breached.v1` | 임계치 초과 감지 |
| 발행 | `customs.ewacs.forecast-warned.v1` | 초과 **전** 사전 경고 |
| 발행 | `customs.ewacs.insight-published.v1` | 인사이트 보고서 생성 |
| 소비 | `data-replication-events` | 참조 데이터 복제 |
| 소비 | (미정) EWACS 실시간 업무 이벤트 | §12-② 에서 계약 확정 |

### 6.2 발행 — Outbox 경유

업무 트랜잭션과 발행의 원자성을 위해 **반드시 `OutboxWriter.save()`** 를 쓴다. 직접 `KafkaTemplate` 을 부르지 않는다.
`cupia.streams.outbox.enabled: true` 는 `application.yml` 에, local 은 `processor-enabled` 까지 켠다(risk 관례).

### 6.3 소비 — 재시도·DLQ·멱등

risk 의 `DeclarationLodgedConsumer` 를 그대로 본뜬다.

```java
@Bean
public Consumer<Message<Envelope<XxxEvent>>> onXxx(MessageConsumerFactory factory) {
  return factory.createRetryableConsumer(this::handle);
}
```

- 바인딩은 `application-admin.yml` 의 `spring.cloud.stream.bindings.<함수명>-in-0`.
- **`spring.cloud.function.definition` 에 소비자 이름을 세미콜론으로 전부 합성한다.** 하나만 남기면 나머지가 조용히 안 돈다 — 기동은 성공하고 이벤트만 안 온다(risk 주석의 실측 경고).
- **멱등은 별도 표를 두지 않는다.** `evnt_id` UNIQUE 위반으로 올라온 `DuplicateKeyException` 을 「이미 처리됨」으로 보고 조용히 끝낸다.
- 같은 토픽을 여러 소비자가 받아야 하면 **group 을 반드시 다르게** 준다 — 공유하면 파티션이 갈려 서로의 이벤트를 못 본다.

### 6.4 알림 박스와의 계약

`cupia-alert-box` 는 EWACS 도메인 타입을 **참조하지 않는다**(재사용 요건). 봉투는 도메인 무관 필드만 싣는다 — 발신원, 심각도, 중복키, 상태(`FIRING`/`RESOLVED`), 라벨, 주석, 렌더 문구.
**상태 전이 기반 발송 + 쿨다운** 으로 플랩을 억제한다(`sentinel` DESIGN.md 관례). ArchUnit 규칙으로 «alert-box → ewacs 패키지 의존 금지»를 강제한다.

---

## 7. 구현 순서 — 수직 슬라이스

각 슬라이스는 **작동하는 관통 경로**를 남긴다. 층을 반씩 쌓아 올리지 않는다.

| # | 슬라이스 | 만드는 것 | 완료 조건 |
|---|---|---|---|
| **S0** | 골격 | 템플릿 파생 → 전역 치환(`sample`→`ewacs`, `Sample`→`Ewacs`, `sample-service`→`ewacs-service`, `sampleRemote`→`ewacsRemote`, 스키마·context-path·포트) · trade 패키지 제거 · Jenkinsfile 정합 | `mvn -f ewacs-service/pom.xml verify` 그린 + ArchUnit 통과 + `cd ewacs-mfe && pnpm verify` 그린 |
| **S1** | 수집 계약 | `common/ingest/` 포트 인터페이스 · `ReplayIngestService`(CSV 시간축 재생) · 합성 데이터셋 | 재생만으로 관측치 원장이 채워진다 |
| **S2** | 원장·피처 | V001~V003 · Mapper + XML · `FeatureBuilderService` · Spring Batch 야간 잡 | `MapperIT` (Testcontainers, 운영 DDL) 그린 |
| **S3** | **동적 임계치 관통** | V004·V005 · `ThresholdBaselineEngine`(순수) · `ThresholdEvaluationService` · 조회 API + MFE 화면 1개 | 화면에서 버킷별 임계치가 보이고, 초과가 판정된다 |
| **S4** | 발행 | V006·V007(Outbox) · `ThresholdBreachedEvent` · `OutboxWriter` 연결 | 실 Kafka(Testcontainers)로 이벤트가 나간다 |
| **S5** | **알림 박스** | `cupia-alert-box` 별도 모듈 · 소비자 · `cupia-notification` 배달 · 중복·플랩 억제 | **수신자에게 도달**까지 통합 테스트. 「Outbox 행이 생겼다」로 끝내지 않는다 |
| **S6** | 백테스트 하네스 | 과거 구간 재생 → 고정 임계치와 동일 조건 비교 → 오탐·미탐 산출 | **G3-1 게이트의 판정 도구.** 수치가 자동으로 나온다 |
| **S7** | 예측 | V008 · `ForecastEngine`(순수, Holt-Winters + 예측구간) · `forecast-warned` 발행 | 백테스트에서 리드타임·적중률 산출 |
| **S8** | RCA | V009 · `RootCauseEngine`(순수, 기여도 분해) | 알려진 병목 시나리오 재현 테스트 통과 |
| **S9** | LLM 인사이트 | V010·V011 · 프롬프트 표·이력·롤백 · vLLM HTTP 호출 · 보고서 화면 | 프롬프트를 화면에서 고치고 이력이 남는다 |
| **S10** | 대응 추천 | V012 · `StaffingRecommendationEngine`(순수, 제약 기반 배분) | 제약 위반 0건 |
| **S11** | 오케스트레이터 | `AgentOrchestrator` — 감지→분석→보고→추천 라우팅 | 워크플로 관통 통합 테스트 |
| **S12** | 실연동 | `EwacsMetricAdapter` 로 교체 · V013 구독 테이블 | `ReplayAdapter` 를 끄고 동일 테스트가 그린 |

> **S3·S5 가 6월 말까지의 목표**다. 이 둘이 서면 나머지는 같은 모양의 반복이 된다.
> **S6 을 S7 보다 앞에 둔 것이 의도**다 — 판정 도구가 없으면 예측 엔진의 좋고 나쁨을 말로만 다투게 된다.

---

## 8. 테스트 배치

risk 의 명명·배치를 그대로 쓴다.

| 종류 | 파일명 | 성격 |
|---|---|---|
| 서비스 단위 | `XxxServiceTest.java` | Mockito. DB·Kafka 없음 |
| 매퍼 통합 | `XxxMapperIT.java` | **Testcontainers PostgreSQL 17 + 운영 DDL.** 마이그레이션 결함이 여기서 잡힌다 |
| 엔진 단위 | `XxxEngineTest.java` | 순수 컴포넌트라 컨테이너 불요. **가장 촘촘하게 쓴다** |
| enum | `common/…/enums/XxxTest.java` | 코드값·매트릭스 검증 |
| 아키텍처 | `architecture/PackageDependencyTest.java` | `extends CupiaArchitectureRules` + `basePackage()` 오버라이드만 |
| 화면 | Playwright E2E | 플랫폼 QA-04 표준 |
| 픽스처 | `src/test/resources/db/*-fixture.sql` | |

### 8.4 백테스트 하네스 (S6)

**보고서가 아니라 테스트 스코프의 실행물**로 만든다. 엔진이 순수 컴포넌트라 가능한 설계다 — 과거 구간을 엔진에 그대로 흘려 넣고, 같은 구간을 고정 임계치 룰(V005)에도 흘려, 오탐·미탐·리드타임을 표로 낸다. CI 에서 회귀로 돌린다.

### 8.5 게이트

- Jenkins **변경 라인 80%** (`DIFF_COVERAGE_MIN`, JaCoCo + diff-cover). feature/dev 브랜치에서만 — main 은 변경분이 공집합이라 스킵.
- 커버리지 제외: `**/dto/**`, `**/*Mapper*.class`, `*ServiceApplication.class`.
- ArchUnit 위반은 게이트와 별개로 즉시 실패.

---

## 9. MFE 구현 규약

- **admin 전용.** `vite.config.trade.ts`·`remote-entry-trade.tsx`·`routes/trade-routes.tsx`·`locale-resources.trade.ts` 는 삭제한다. `verify-isolation.sh` 의 URL prefix 패턴을 서비스 context-path 와 일치시킨다 — 어긋나면 검사가 매칭되지 않아 **조용히 공회전한다**(템플릿 README 의 경고).
- **shared 의존성은 `createSharedDeps()` 가 생성한다**(CUPIA-FE-001). 손으로 쓰지 않는다.
- `@cupia/ui` · `@cupia/customs-common` 버전은 **`@cupia/frontend-bom` 의 canonical 핀**을 따른다. 개별 조정 금지 — risk·tariff 가 BOM 버전 정합 커밋을 반복적으로 남기고 있다.
- 기능 폴더 구조(risk 실측): `features/admin/<area>/<feature>/{api,hooks,components,schema}` + `types.ts` + `<feature>-page.tsx` + `index.ts`.
- i18n: `locales/{ko-KR,en-US}/<feature>/*.json`, `verify-i18n-coverage.mjs` 가 누락을 잡는다.
- 알림 표준: **성공은 토스트, 실패는 인라인**(FE 표준 14 §6.5).

---

## 10. 로컬 개발 부트스트랩

```bash
# 0) 전제 — JDK 25, Node ≥ 24, pnpm ≥ 10, Docker, direnv, Nexus 자격증명
export NEXUS_NPM_AUTH=...          # base64(user:password)

# 1) 공용 인프라 (customs-infra 의 컨테이너)
#    PostgreSQL 17 (cupia-customs-postgres), Kafka, Redis

# 2) 선행 의존성 설치 — customs-common 이 컴파일 타임 참조다
cd ../../libs/customs-common && mvn install -DskipTests

# 3) 백엔드
cd ewacs-service && ./mvnw spring-boot:run       # 기본 프로파일 admin,local

# 4) 프론트
cd ewacs-mfe && pnpm install && pnpm dev:admin
```

> **컴파일 통과 ≠ 동작.** MyBatis 매핑·JSONB 경로·프론트 배선은 런타임에만 터진다. 변경 후 실기동해 화면으로 확인한다(`cupia-meta` README 의 경고). 삭제 작업 뒤에는 `mvn -o clean` 이 필수다 — `target/classes` 의 stale XML 이 앱 기동을 통째로 막는다.

---

## 11. 프레임워크 의존성 (pom 초안)

템플릿 pom 에서 출발해 다음을 조정한다.

| 조치 | 대상 | 이유 |
|---|---|---|
| 유지 | `cupia-web` · `cupia-security` · `cupia-streams` · `cupia-data-replication` · `customs-common` | 템플릿 기본 구성 |
| 유지 | actuator · micrometer-tracing-otel · prometheus | 관측 표준 |
| **추가** | `cupia-notification` | 알림 발송 표면 (S5) |
| **추가** | `cupia-realtime` | 대시보드 SSE 푸시 |
| **추가** | `spring-boot-starter-batch` | 야간 집계·재학습 (S2) |
| **추가** | `commons-math3` 또는 동급 | Holt-Winters·통계 (S7). **라이선스 확인 후**(NFR-05) |
| 검토 | `cupia-privacy` | HR·근무 데이터를 다루면 접속기록 의무 발생 (상위 계획 R-7) |
| 제외 | `cupia-file-service` | 파일 REST 엔드포인트를 자동 노출한다. 파일이 필요하면 `cupia-file` 코어만 넣고 권한 검증을 갖춘 자체 컨트롤러를 둔다(템플릿 주석) |

---

## 12. 착수 전 등록·확인 필요 항목

| # | 항목 | 확인처 |
|---|---|---|
| ① | **저장소 위치** — `cupia/customs/domains/customs-ewacs` 인가 `cupia/solutions/` 인가 | EWACS 가 관세 도메인 계열인지 사내 솔루션인지에 따라 갈린다. 팀·권한 그룹도 함께 결정된다 |
| ② | **EWACS 업무 이벤트 계약** — 실시간 이벤트가 있는가, 아니면 DB 폴링/배치인가 | 없으면 S12 가 배치 어댑터가 된다 |
| ③ | **포트 배정** · context-path `/admin/ewacs/api` | 도메인 포트표(customs-docs). 분석 §6-2 의 포트 표기 불일치 주의 — 표가 아니라 실기동으로 확인 |
| ④ | **스키마·계정** `ewc_db` / `ewc_user` 생성 | 인프라 팀 |
| ⑤ | **`ewc` 테이블 prefix 등재** | `cupia-ai-dev` 금지 패턴 정본 (CUPIA-WARN-002) |
| ⑥ | **`record` 금지 vs risk 선례** — 정본을 따른다는 ADR 발행 | §3 경고 |
| ⑦ | **Nexus 계정** | 없으면 S0 부터 불가 (상위 계획 R-1) |
| ⑧ | **Kafka 토픽·group 생성 권한** | 토픽 명명 `customs.ewacs.*` 사전 합의 |
| ⑨ | **vLLM 엔드포인트·모델·동시성 한도** | S9. 과제 1 과 공유 여부 (상위 계획 R-6) |
| ⑩ | **Glossary 등재 절차** — 신규 용어 ADR 경로 | §5 의 표·컬럼명 확정에 필요 |
