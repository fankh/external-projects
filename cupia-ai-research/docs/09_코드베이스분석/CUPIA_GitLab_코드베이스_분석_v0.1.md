# CUPIA GitLab 코드베이스 분석 (v0.1)

| 항목 | 내용 |
|---|---|
| 대상 | `https://git.cupia-framework.64bit.kr/` (CUPIA 사내 GitLab) |
| 조사일 | 2026-08-23 |
| 조사 계정 | `khchoi` (Kyeong-Ho Choi, khchoi@seekerslab.com, user id 23) — 읽기 전용 참조 계정 |
| 조사 방법 | GitLab REST API v4 (읽기만). 저장소 목록·그룹·트리·README·pom/package.json·커밋 이력 조회 |
| 문서 성격 | **내부 분석 자료**. 발주처 제출용 산출물이 아니므로 Office 포맷 규칙(README 말미) 적용 대상이 아니다 |

> **이 서버는 참조 전용이다.** 조사·인용은 하되 push·branch·MR·issue 생성 등 어떤 쓰기도 하지 않았고, 앞으로도 하지 않는다.
> 모든 산출물은 본 저장소(`cupia-ai-research`)에 둔다.

---

## 1. 한눈에

CUPIA GitLab에는 **저장소 149개, 그룹 40개**가 있다. 이름만 보면 하나의 거대한 플랫폼처럼 보이지만,
실제로는 **성격이 다른 5개 계열**이 한 서버에 모여 있고 그중 활발히 움직이는 것은 두 계열뿐이다.

| 계열 | 저장소 수 | 상태 | 성격 |
|---|---:|---|---|
| `cupia/ncms/**` | 102 | **동결** — 전부 2026-08-10 단일 임포트, 저장소당 커밋 1건 | 탄자니아 TANCIS 레거시(Spring Boot 3.3.8 / Java 17) 스냅샷 |
| `cupia/customs/**` | 21 | **활발** — 주력 개발 라인 | 신규 관세행정 MSA 플랫폼 (Java 25 / Spring Boot 4.1 / React 19 MFE) |
| `cupia/ai-team/**` | 11 | 혼재 — 4개 활발, 4개 동결, 2개 빈 저장소 | AI 응용 서비스 (Python/FastAPI 중심, 플랫폼과 별도 스택) |
| `cupia/framework/**` | 7 | **활발** — 공통 코드 정본 | 백엔드 프레임워크 · 디자인 시스템 · 프론트 공용 라이브러리 |
| `cupia/solutions/**` | 4 | 활발 | 사내 솔루션 (EDX B2Bi, 메타관리, AI 개발 하네스) |
| `epass-react/**` | 3 | 동결 (2026-06-12 이후 커밋 없음) | Angular → React 18 전환 시도 |
| `itzmehs/bi-sql-assistant` | 1 | — | Text-to-SQL 데스크톱 도구 |

**본 과제(2026 AI 연구과제) 관점의 결론 세 가지:**

1. **"레퍼런스 공통 코드"는 `cupia/framework` + `cupia/customs`다.** 여기에 백엔드 프레임워크(모듈 18개,
   AutoConfiguration 80개), 디자인 시스템(`@cupia/ui` 컴포넌트 77개), MSA 규약, GitOps 배포, CI 게이트가
   모두 정본으로 존재한다. 재사용 가치가 가장 높다.
2. **그런데 CUPIA의 AI 저장소들은 그 공통 코드를 쓰지 않는다.** `cupia/ai-team/*`은 Python/FastAPI +
   Java 17/Spring Boot 3 조합이고, 프레임워크 BOM·디자인 시스템·MFE 규약 어느 것도 따르지 않는다.
   **즉 "AI 트랙"과 "플랫폼 트랙"은 사실상 분리된 두 세계다** — 과제 산출물을 어느 쪽 규약에 맞출지가
   착수 전에 정해져야 할 사항이다(§7.3).
3. **과제 2(EWACS)의 대상 코드는 이 서버에 없다.** 프로젝트 전수 검색에서 EWACS 관련 저장소가 하나도
   나오지 않았다. SOW 별첨 "착수 전 협의 필요 사항"의 *EWACS 현행 문서·접근 권한* 항목이 그대로 유효하다.

---

## 2. 프레임워크 계층 — 재사용 대상 공통 코드

### 2.1 `cupia/framework/backend/cupia-framework` (id 3)

CUPIA의 백엔드 정본. **Java 25 / Spring Boot 4.1.0 / Maven**, 루트 버전 `2.3.1-SNAPSHOT`,
배포 BOM은 `cupia.framework:cupia-dependencies`(현행 소비 버전 **2.3.0**).

| 모듈 | 책임 | AutoConfig |
|---|---|---:|
| `cupia-dependencies` | 의존성 버전 관리 BOM | – |
| `cupia-core` | 예외(RFC 9457 Problem Details), i18n, 감사, UUID v7(RFC 9562) ID 생성, 2단 캐시(Caffeine+Redis), 비동기·MDC 전파, 스케줄러 락 | 10 |
| `cupia-web` | 에러 응답, Request ID, API 봉투, CORS, 보안 헤더, 서비스 클라이언트, OpenAPI 스키마 | 11 |
| `cupia-security` | JWT(대칭/비대칭·RTR·블랙리스트), OAuth2 Resource Server, API Key, IP 접근제어, 로그인 시도 제한, 대칭 암호화, 보안 감사 | 15 |
| `cupia-streams` | 메시지 봉투, 채널, 재시도, **Outbox 패턴** | 7 |
| `cupia-data-replication` | MSA 마스터 데이터 발행/구독 복제, 순서 가드, poison 격리 | 1 |
| `cupia-cqrs` | CQRS + Event Sourcing (Axon 5, Axon Server 미사용) | 1 |
| `cupia-saga` | 분산 트랜잭션 Saga 오케스트레이션(역순 보상) | 2 |
| `cupia-file` / `cupia-file-service` | 스토리지 추상화(Local/MinIO), 재개형 청크 업로드, 버저닝, REST API | 4 / 2 |
| `cupia-realtime` | WebSocket(STOMP)·SSE, Redis Pub/Sub 팬아웃, JWT 인증, 핸드셰이크 티켓 | 6 |
| `cupia-mail` / `cupia-sms` | Spring Event + Outbox 기반 발송 이벤트 | 2 / 2 |
| `cupia-notification-service` | 통합 알림 오케스트레이션(렌더·정책·수신자해석) + MAIL/SMS 배달 워커 + IN_APP 수신함 | 5 |
| `cupia-gateway` | Spring Cloud Gateway(Reactive), 헤더 표준화, 레이트리밋, JWT 검증, BFF(OIDC·PKCE·TokenRelay) | 4 |
| `cupia-excel` | `@ExcelColumn` 다운로드/업로드, SXSSF 스트리밍, Formula Injection 이스케이프 | – |
| `cupia-privacy` | `@PrivacyAccess` AOP 개인정보 접속기록(안전성 확보조치 기준 제8조), 보존기간 파기 스케줄러 | 2 |
| `cupia-signature` | PKI 무관 AdES 전자서명 계층 Phase 1 (KMS Provider, 내부 타임스탬프, PEM 신뢰 앵커) | 1 |
| `cupia-archunit` | 아키텍처 규칙 정본(`CupiaArchitectureRules`) — 각 도메인이 상속 | – |

총 AutoConfiguration 80개. 의존성 추가만으로 기능이 켜지는 Zero-Configuration 지향.

### 2.2 `cupia/framework/frontend/cupia-design-system` (id 9)

pnpm 9 워크스페이스 + Turborepo. **React 19 / TypeScript 5.9 / Tailwind CSS v4 / Vite 7 / Storybook 10**.

- `@cupia/ui` — 현재 **v0.10.5**, 공개 컴포넌트 77개 + 화면 패턴 8개. shadcn/ui + Radix 기반.
  **소스-출하(source-shipping)** 패키지다 — 런타임은 TS/TSX 소스를 그대로 내보내고 `dist/`에는 타입 선언만 담는다.
  소비 측 번들러가 `node_modules` 안의 소스를 트랜스파일해야 하므로 빌드 설정에 제약이 붙는다.
- `@cupia/tokens` — CSS Custom Properties 디자인 토큰. primitive → semantic → dark 계층, 기본 테마는
  corporate navy + gold, site 테마 5종(Ocean/Forest/Sunset/Minimal/Trade). 국가별 테마는 폐기됨.
- 부속 앱: Storybook 카탈로그(Playwright 시각 회귀), 문서 사이트(7개 로케일), 테마 에디터.

### 2.3 `cupia/framework/frontend/cupia-frontend-libs` (id 19)

모든 Shell·MFE가 공유하는 3개 패키지 — `@cupia/http-client`(axios 팩토리, 토큰 자동 주입·사전 갱신·401 재시도),
`@cupia/file-client`(청크 업로드 + React hooks), `@cupia/shell-shared`(Shell↔Remote 컨텍스트·이벤트 버스).
tsup 듀얼 번들, changesets 릴리스, Jenkins → Nexus 배포.

### 2.4 배포 레지스트리 — 로컬 빌드의 실질적 관문

프론트/백엔드 공통 산출물은 **사설 Nexus**(`nexus.customs.cupia.or.kr:18081`, 외부 `211.239.120.52:18081`)에 있다.

- 프론트: `.npmrc` + 환경변수 `NEXUS_HOST` · `NEXUS_NPM_AUTH`(base64 `user:password`). **pnpm 전용** —
  `.npmrc`의 `${VAR-default}` 폴백 문법을 npm이 해석하지 못해 `ERR_INVALID_URL`로 깨진다.
- 백엔드: `cupia.framework:*` 아티팩트 역시 Nexus 경유.

> **확인 필요 ①** — 지금의 GitLab 읽기 권한만으로는 Nexus에 접근할 수 없다. 프레임워크·디자인 시스템을
> 실제로 빌드·구동해 보려면 Nexus 계정이 별도로 필요하다. 소스 열람만으로 충분한지, 실행 검증까지 할지에 따라
> 요청 범위가 달라진다.

### 2.5 동결된 프레임워크 저장소

`cupia-msa-infra`(25, 최근 2개월 커밋 0건), `cupia-framework-docs`(59, 동 0건, 40페이지 개발자 가이드 사이트),
`cupia-epass-docs`(39, 650MB 문서 덤프). 문서 사이트는 내용 자체는 유용하나 갱신이 멈춰 있다.

---

## 3. 관세 플랫폼 (`cupia/customs`, 21개) — 규약이 살아 있는 곳

### 3.1 구성

| 그룹 | 저장소 | 비고 |
|---|---|---|
| `domains` | `customs-portal`(54) · `customs-clearance`(43) · `customs-risk`(45) · `customs-cargo`(44) · `customs-tariff`(70) · `customs-tariff-flow-rule-engine`(75) · `cupia-customs-domain-template`(77) | portal·clearance가 주력. **cargo(44)는 `CLAUDE.md` 한 장뿐인 빈 골격** |
| `shells` | `customs-admin-shell`(52, 내부망) · `customs-trade-shell`(53, 외부망) | Module Federation 호스트 |
| `support` | `customs-config-service`(46) · `customs-discovery-service`(47) · `customs-config-repo`(51) · gateway 3종(48 admin / 49 oga / 50 trade) | Spring Cloud |
| `libs` | `customs-common`(42) · `customs-frontend-libs`(56) · `customs-keycloak-federation`(63) | 참조데이터 read API / 도메인 프론트 위젯 / Keycloak 연동 |
| `infra` | `customs-infra`(27) · `customs-deploy`(29) | 부트스트랩 템플릿 / **ArgoCD GitOps 진실** |
| `docs` | `customs-docs`(18) | 표준·운영 paradigm SSOT |

### 3.2 핵심 아키텍처 규약 — 액터 분리

가장 특징적인 결정이다. **하나의 코드베이스를 액터(admin=관세직원·내부망 / trade=회사 사용자·외부망)별로
분리 기동·분리 빌드**하고, 백엔드와 프론트에 **대칭으로** 적용한다.

- 백엔드 패키지: `cupia.customs.<domain>.{common, admin, trade, config}`.
  `admin ↔ trade` 상호 참조 금지를 **ArchUnit `PackageDependencyTest`가 CI에서 강제**(위반 시 빌드 실패).
- **`ActorProfileValidator`가 액터 프로파일 누락 시 부팅을 차단**한다 — 컨트롤러가 0개인데
  `/actuator/health`는 200을 반환하며 트래픽을 받는 사고를 막기 위한 장치다.
- 프로파일 = 액터(`admin`|`trade`) × 환경(`local`|`dev`|`kubernetes`) + 부가(`cloud`|`keycloak`).
  `cloud`와 `kubernetes`는 조합하지 않는다(k8s에서는 kube-dns가 discovery를 맡음).
- 프론트는 `vite.config.{base,admin,trade}.ts` 3분할 빌드 → `dist-admin/`, `dist-trade/`,
  federation expose `portalRemote/admin` · `portalRemote/trade`.
- DB는 단일 PostgreSQL 17 인스턴스에 도메인별 스키마 분리 — `ptl_db` · `clr_db` · `rsm_db` · `trf_db`.
- Shell은 게이트키퍼 역할만 남긴다(인증·대시보드·개인메뉴·메뉴/권한 메타데이터). 업무 화면은 전부 Remote에서 마운트.
  운영 빌드는 `VITE_MFE_ORIGIN_ALLOWLIST`로 Remote origin을 화이트리스트하고, CSP는 모드별 주입 +
  운영은 nginx 헤더로 강제한다(`unsafe-eval` 금지, `wasm-unsafe-eval`만 허용).

### 3.3 명명 권위 서열 (`customs-docs/CLAUDE.md`)

관세 도메인 산출물을 낼 때 **가장 먼저 확인해야 할 규칙**이다. 명명은 추측으로 정하지 않고 서열대로 조회한다.

1. RKC General Annex Ch.3 (1999) + 한국 비준 Specific Annexes
2. WCO Data Model 4.2.0
3. UN/EDIFACT CUSDEC D.16B
4. KCS 관세법 + 시행령 + 고시
5. E-PASS 원본 컬럼 — **구조 이관 근거로만** 사용, 컬럼명·타입 답습 금지
6. (참고) `cupia-meta` CSV — 결정 근거 아님

레이어별 표기도 분리한다: Java는 Full English camelCase(`totalPackageCount`), DB는 약어 snake_case(`tot_pkg_cnt`),
둘 사이의 유일한 다리는 Mapper XML의 `AS` alias. 신규 entity는 `docs/data-model/standards-mapping/`의
traceability matrix 없이는 머지 금지.

### 3.4 CI/CD와 품질 게이트

- **CI는 Jenkins로 확정**(2026-08-01 결정). 사내 26개 리포가 Jenkinsfile로 돌고 k8s 에이전트·Kaniko·
  GitOps 연동까지 완성돼 있다. GitLab CI는 2026-02-03 실패를 마지막으로 방치 상태.
- **커버리지 게이트는 "변경 라인 80%"**(JaCoCo + `diff-cover`, `DIFF_COVERAGE_MIN`). 전체 비율에는 기준을 두지 않는다 —
  레거시가 섞인 리포에서 전체 기준은 첫날부터 통과 불가라 예외가 쌓이고 결국 게이트가 꺼지기 때문.
  기존 26개 Jenkinsfile은 전부 `mvn package -DskipTests`였고, 신규 리포부터 기본값을 뒤집는 중이다.
- ArchUnit 위반은 게이트와 별개로 즉시 빌드 실패. 통합 테스트는 Testcontainers로 **운영 DDL 위에서** 돈다.
- **배포는 ArgoCD GitOps.** `customs-deploy`가 유일한 진실이며 Jenkins가 `image.tag`를 자동 갱신한다.
  베이스 Helm 차트 2종(`spring-boot-base`, `frontend-base`), 환경 3종(dev/test/prod), App-of-Apps + ApplicationSet 3종.
- 클러스터는 온프레미스 K8s. 단일 LoadBalancer(20.20.20.200) → 외부 NAT `211.239.120.52:10443`.
  ArgoCD·Jenkins·Nexus·Grafana·Kafka UI·Keycloak·Mailpit이 같은 인그레스 뒤에 있다.

> **관찰 ①(보안)** — `customs-infra/README.md`가 ArgoCD·Grafana·Shell 등의 **공용 관리자 계정과 평문
> 비밀번호를 문서에 그대로 적어 두고 있다**(본 문서에는 값을 옮기지 않는다). 폐쇄망 전제라 하더라도
> 저장소 열람 권한이 곧 운영 콘솔 접근 권한이 되는 구조다. 우리가 고칠 대상은 아니나, 협업 과정에서
> 자격증명을 주고받게 될 경우 이 관행을 따라가지 않도록 우리 쪽 기준을 먼저 정해 둘 필요가 있다.

### 3.5 도메인 신규 생성 절차

`cupia-customs-domain-template`(77)이 골격 정본이다. 추출 범위는 "되돌리기 비싼 것"으로 한정된다 —
디렉터리 레이아웃, pom 구조, 패키지 네이밍, Dockerfile, 프로파일 격리 골격, ArchUnit 뼈대, Jenkinsfile,
MFE federation 분리 빌드 + i18n 부트스트랩. 도메인 코드·업무 설정·공용 UI 킷은 제외한다.
치환 절차(패키지·모듈명·스키마·context-path·federation name·포트)는 `cupia-dev-plugin`의
`cupia-new-product` 스킬이 자동화한다.

---

## 4. AI 계열 (`cupia/ai-team` 11개 + `cupia/solutions` 4개)

### 4.1 과제 1과 직접 맞닿는 저장소

| 저장소 | 내용 | 활동 |
|---|---|---|
| `ai-team/customs-docs` (38) | **UCR(Unique Consignment Reference) 기반 통관 서류 검증 파이프라인.** 현재 가장 완성도 높은 실물 | **활발** (100+ 커밋/2개월) |
| `ai-team/customs-ai` (37) | 관세 AI 변종 4종을 브랜치로 보관 — `Ai4`(=main, SAD upload-batch + agent abstraction) / `Ai3`(5-agent 파이프라인) / `Ai2`·`Ai`(dead) | 동결 (2개월 커밋 0건) |
| `ai-team/ai3-archive` (8) | 구 모노레포. FastAPI + **Chandra OCR vLLM** + **EXAONE-4.0.1-32B**, WCO DM 매핑, 4개 카테고리 병렬 추출 프롬프트 | 아카이브 |
| `ai-team/hs-classify-ai` (35) | **HS Code 자동 분류** — FastAPI + LangGraph 6단 파이프라인(정규화→챕터선정→검색→판정→국가세율→번역), Neo4j 그래프 + pgvector, WCO 2022 전수 적재, bge-m3 임베딩, vLLM Gemma. Quick Validator(물품명 vs 신고 HS)는 독립 에이전트 | **활발** |
| `ai-team/keyword-filter` (36) | 품목-키워드 매칭 + 해시태그 분류 (vLLM) | 동결 |

`ai-team/customs-docs`(38) 상세 — 과제 1의 출발점으로 삼을 만한 유일한 현행 구현이다.

- 구성: Java 17 / Spring Boot 3 백엔드 + Python 3.11 `ocr-service`(PaddleOCR) + Python `extractor-service`(vLLM FP8)
  + React 19 / MUI 프론트 + PostgreSQL 16. vLLM은 **기존에 떠 있는 것을 재사용**하고 단독 기동하지 않는다.
- 도메인: UCR 상태 머신 `DRAFT → UPLOADED → PROCESSING → READY → SUBMITTED`,
  첨부 카테고리(INVOICE/PACKING_LIST/BL 필수 + 4종 선택, DB로 런타임 관리),
  **WCO Data Model 필드 정의·값 테이블**, **3-way 크로스체크 플래그**(`MATCH`/`MISMATCH`/`PARTIAL`/`NOT_AVAILABLE`),
  v0.11.0에서 추가된 **상호정합성 검증 게이트**(`POST /ucr/{id}/verify` + SUBMITTED 차단 + 자동 무효화).
- 운영 기능이 이미 상당히 들어 있다: **프롬프트 템플릿을 관리자가 화면에서 편집**하고 `prompt_history`에
  이력이 쌓여 롤백 가능(`change_summary` 필수 — 감사 추적), 스토리지 백엔드 런타임 전환(FILESYSTEM/MinIO/WebDAV),
  Role 기반 접근제어 4종 + "1 user = 1 inbox" 모델, DB 기반 Drawer 메뉴.
- 버전 v0.11.1(2026-06-08), Flyway V1–V20 / 14테이블, Harbor 이미지 4종(`harbor.tancis.64bit.kr/epass/...`).
- 명시된 한계: MinIO/WebDAV 선택 시 OCR 연동 미지원, SSE 미도입(폴링), `audit_log` 미구현, 오프라인 배포 번들 미비.

> **확인 필요 ②(중요)** — SOW와 `docs/reference/03_RAG_Codex_고객시연자료`가 기술하는 과제 1 대상 시스템의 스펙과,
> 이 서버에서 실제로 확인되는 코드가 **일치하지 않는다.**
>
> | SOW·시연자료 기준 | 서버에서 확인된 것 |
> |---|---|
> | Tesseract + PaddleOCR 앙상블 | (38) PaddleOCR 단독 / (8) Chandra OCR |
> | PP-Structure 좌표 임베딩 | 해당 코드 미확인 |
> | TAPAS(테이블) + BGE-M3 Two-Track RAG | (35)에 BGE-M3 + pgvector는 있으나 TAPAS 미확인 |
> | gpt-oss-120b | (8) EXAONE-4.0.1-32B / (35) Gemma 계열 |
> | "RAG Codex" 명칭 | 동명 저장소 없음 |
>
> 가능성은 셋이다 — (a) PoC 코드가 이 GitLab이 아닌 다른 곳(로컬·별도 서버)에 있다, (b) `customs-ai`의
> `Ai4`/`Ai3` 브랜치 내부에 있으나 README에 드러나지 않는다, (c) 시연자료가 실물보다 앞선 계획을 담았다.
> **과제 1의 "서비스 수준 진단(4월)"을 시작하기 전에 이 대상 확정이 선행되어야 한다.**

### 4.2 과제 2와 맞닿는 자산

**EWACS 저장소는 존재하지 않는다**(프로젝트 전수 검색 결과 0건). 다만 요구 모듈별로 갖다 쓸 만한 것은 있다.

| 과제 2 요구 모듈 | 재사용 후보 | 판단 |
|---|---|---|
| 알림 모듈(독립 박스화) | `cupia-notification-service`(오케스트레이션 + MAIL/SMS 워커 + IN_APP 수신함), `cupia-mail`/`cupia-sms`(Outbox) | **바로 적용 가능.** SOW의 "알림 모듈 독립 박스화"가 이미 프레임워크에 구현되어 있다 |
| 통합 계층 (REST / Event Bus / Webhook) | `cupia-streams`(봉투·채널·재시도·Outbox), `cupia-gateway`, `cupia-realtime`(SSE/WS + Redis 팬아웃) | **바로 적용 가능** |
| 이상 탐지 · 관제 · 알림 라우팅 | `ai-team/sentinel`(78) — Go 경량 Agent + Center, outbound gRPC bidi + mTLS, 자원 수집, 태스크 푸시 배포, **vLLM 기반 이상 분석 → Slack 알림**, 관리 REST + Web UI | **골격으로 유용.** "룰 기반 임계치 → AI 판정"의 작동하는 선례 |
| 예측 엔진 · 동적 임계치(시간대/요일/계절) · RCA · 대응 추천 | — | **해당 코드 없음. 신규 개발 영역** |

### 4.3 나머지 AI 저장소

- `ai-team/omnitrans`(79) — Qwen3-Omni vLLM 실시간 통역 중계. 완전 로컬·무저장 원칙, pytest 736건,
  **크로스 스택 e2e**(실 SPA + 실 uvicorn + 실 크로미움 왕복)를 최상위 게이트로 둔다. 활발.
- `ai-team/uniterp`(71) — 오프라인 1급 실시간 통역기. 2트랙(서버 연계형 / 로컬 단독형) + 런타임 무중단 폴백,
  OpenVINO NPU 실기 검증. **NLLB/Seamless 계열 가중치의 CC-BY-NC 제한 때문에 정부 협력 프로젝트 배포에
  부적합하다는 판단이 기록되어 있다** — 우리 과제의 모델 선정에도 동일한 라이선스 검토가 필요하다.
- `ai-team/prompt-engineering`(81) — Claude Code 전역 지시서·에이전트 배포 스크립트(`install.sh`).
- `ai-team/ai`(5), `ai-team/oracle-sql-tuner`(34) — 사실상 빈 저장소.

### 4.4 `cupia/solutions`

- `cupia-edx`(72) / **`cupia-edx-v1`(185)** — 관세행정 ↔ 선사·항공사·운송업자·관세사·항만청 전자문서 교환 B2Bi/ESB.
  v1은 **Java 25 / Spring Boot 4.1 / Spring Modulith 2.1 / Camel 4.21 / PostgreSQL 18 / Flyway / MyBatis**로
  재작성 중이며 **조사일 당일까지 커밋이 이어지는 가장 활발한 저장소**다. 설정 모델과 실행 모델 분리,
  Pipeline/Route/Mapping 버전·배포 이력 보존, Instance/Attempt/Step 3단 이력, at-least-once + 저장소 멱등성.
- `cupia-meta`(69) — 관세청 데이터 표준(MDMS 기관표준) 관리. 표준단어·도메인·용어·컬럼 사전 CRUD +
  승인 워크플로 + 논리모델 → DDL·ERD 생성 + 운영 스키마 대사.
- `cupia-ai-dev`(80) — **CUPIA 개발 표준을 AI가 어길 수 없게 강제하는 Claude Code 플러그인 마켓플레이스.**
  플러그인 5종(core/backend/frontend/review/domain-customs), 금지 패턴 차단 hook 11종
  (JPA·`record`·물리 DELETE·`${}` 치환 등), 규범(`policies/`, `.ai/`)과 실행 자산(플러그인)의 2층 분리.
  `CLAUDE.md`·`AGENTS.md`에는 내용을 쓰지 않고 `.ai/`를 가리키게 한다. 우리 쪽 작업 방식과 비교할 가치가 있다.

---

## 5. 레거시 계열 — 참고용

### 5.1 `cupia/ncms/**` (102개, TANCIS)

탄자니아 TANCIS 시스템 전체가 2026-08-10에 **일괄 임포트**되었다(저장소당 커밋 1건 = 히스토리 없음).
`tancis-framework`는 **Spring Boot 3.3.8 / Java 17 / Spring Cloud 2023.0.5 / QueryDSL 5 / MyBatis 3.0.3 /
JasperReports 6.21**. 구조는 `front|service` × `{com, ext, int, oga}` + `batch` + `config` + `interface/wso2` + `ai`.
`ncms/ai/tancis-ai-price`는 Dockerfile만 있는 913MB 저장소(모델·데이터 산출물로 추정).

과제와의 관계: 직접 사용처는 없다. 다만 **`cupia/customs`가 이관하려는 원본 업무 로직의 출처**이고,
`customs-risk`가 참조하는 `n-tancis/rkm` 명세(42편, 사람 검증 완료)가 이 계열의 분석 산출물이다.

### 5.2 `epass-react/**` (3개)

`sgw-trd-react`(탄자니아 관세) · `sgw-oga-react` · `sgw-cms-react`. Angular 14 → React 18 전환 시도로,
CRA + craco + Tailwind + Playwright 구성. **2026-06-12 이후 커밋이 없다.**
저장소마다 `node_modules/`와 `build/`가 커밋되어 있어 크기가 80–110MB에 이른다(참고 시 클론 비용 주의).

---

## 6. 관찰된 문서-실물 불일치

분석 중 확인된 드리프트다. **README를 근거로 판단하면 틀리는 지점들**이므로 기록해 둔다.

| # | 내용 | 근거 |
|---|---|---|
| 1 | 다수 README가 스택을 **Spring Boot 4.0.5**로 적고 있으나, 실제 `pom.xml`은 전부 **4.1.0 / Java 25 / cupia-dependencies 2.3.0**이다 | `customs-portal/portal-service/pom.xml`, `customs-clearance/clearance-service/pom.xml`, `customs-common/pom.xml` 실측. `customs-common` README는 BOM을 `1.0.2-SNAPSHOT`으로 표기 |
| 2 | 도메인 서비스 포트가 문서마다 다르다 — `customs-admin-shell` README는 clearance **9182** / risk **9183**, 반면 `customs-risk` README는 **9191**, `customs-tariff` README는 **9199** | 두 README 대조. 어느 쪽이 현행인지 실기동 확인 필요 |
| 3 | `customs-docs`의 세션 핸드오프(§5 현재 작업 상태)가 **2026-05-13 이후 갱신되지 않았다**. 같은 저장소의 표준 문서는 2026-08-03까지 갱신됨 | `docs/operations/session-handoff.md` |
| 4 | `customs-docs` README의 관련 레포 표가 `cupia-customs-clearance` 등 **실제 경로와 다른 이름**을 쓴다(실제는 `customs-clearance`) | README 표 vs API 프로젝트 경로 |
| 5 | `customs-risk`·`customs-cargo`가 그룹 설명에 "P2 진입 예정"으로 적혀 있으나, risk는 2026-08-22에 **선별 판정 엔진 Phase 1**을 커밋했다. cargo는 반대로 `CLAUDE.md` 한 장뿐인 빈 골격 | 프로젝트 description vs 커밋 이력·트리 |
| 6 | 문서화된 개발 paradigm은 **"PR 금지·feature branch 금지·main 직접 push"**(single worktree)이나, `customs-clearance`의 실제 이력에는 `Merge feat/clr-notice-list` 같은 **feature branch 머지**가 있다 | `customs-docs/README.md` vs 저장소 43 커밋 이력 |

---

## 7. 2026 AI 연구과제와의 접점 — 판단이 필요한 지점

### 7.1 과제 1 (e-PASS AI 모델 상품화, 4~7월 / 9 M/M)

| SOW 일정 | 이 서버에서 쓸 수 있는 것 | 공백 |
|---|---|---|
| 4월 서비스 수준 진단 → 최소/목표 사양 | `ai-team/customs-docs`(38) 실물 + 그 `PROJECT_OVERVIEW §12 한계`가 이미 진단 초안 역할을 한다 | **대상 시스템 확정이 먼저**(확인 필요 ②) |
| 4~5월 프롬프트 엔지니어링 고도화 | (38)의 **프롬프트 템플릿 관리 + 이력·롤백 기능이 이미 구현되어 있다** — 실험 인프라를 새로 만들 필요가 없다. (8)의 4개 카테고리 프롬프트가 baseline | Hallucination 억제 평가셋·정량 지표 부재 |
| 5~6월 파이프라인 성능 최적화 | 없음 (배치 추론·양자화·Continuous Batching·멀티 GPU 관련 코드 미확인) | **신규 영역** |
| 6월 시스템 패키징 (REST API, Docker/K8s, Helm) | `customs-infra`/`customs-deploy`의 Helm 베이스 차트 2종 + ArgoCD 패턴을 그대로 답습 가능 | (38)은 현재 Docker Compose + Harbor 이미지 수준 |
| 7월 v1 런칭 (해외 세관 배포) | `uniterp`의 오프라인 배포 검토 선례, (38)의 "오프라인 배포 번들" 후속 과제 항목 | 폐쇄망 배포 번들 미구현 |

### 7.2 과제 2 (EWACS 복합 AI Agent, 4~12월 / 22 M/M)

- **대상 시스템 자체가 이 서버에 없다.** 요건 정의(4~5월) 전에 EWACS 현행 소스·문서·접근 권한 확보가 선행되어야 한다.
- 재사용 가능: 알림 모듈과 통합 계층(REST/Event Bus/Webhook)은 `cupia-notification-service` + `cupia-streams` +
  `cupia-gateway` + `cupia-realtime` 조합으로 **거의 그대로 충족된다**. SOW에서 "알림 모듈 독립 박스화"를
  신규 개발로 잡아 두었다면 재산정 여지가 있다.
- `sentinel`(78)은 "수집 → 이상 판정 → LLM 분석 → 알림"의 작동하는 참조 구현이다. 아키텍처 차용 가치가 높다.
- 신규 개발 영역: 예측 엔진, 동적 임계치 학습, RCA, 인력 재배치 추천.

### 7.3 가장 먼저 정해야 할 것 — 산출물을 어느 스택에 얹을 것인가

이것이 본 분석의 핵심 판단 지점이다. CUPIA 내부에 **두 개의 서로 다른 규약**이 공존한다.

| | **플랫폼 트랙** (`framework` + `customs`) | **AI 트랙** (`ai-team`) |
|---|---|---|
| 스택 | Java 25 / Spring Boot 4.1 / MyBatis / React 19 MFE | Python 3.11 / FastAPI / (일부 Java 17 / Spring Boot 3) / React + MUI |
| 공통 코드 | `cupia-dependencies` BOM, `@cupia/ui`, `@cupia/http-client` | 사용하지 않음 |
| 배포 | Jenkins → Nexus/Harbor → ArgoCD GitOps (K8s) | Docker Compose + Harbor 이미지 |
| 품질 게이트 | ArchUnit + 변경라인 80% 커버리지 + Testcontainers IT | 저장소마다 상이 |
| 명명·표준 | `customs-docs` 권위 서열 강제 | 자유 |

- 산출물이 **관세 플랫폼에 편입**될 것이라면 → 플랫폼 트랙 규약을 따라야 하고, `cupia-customs-domain-template`
  골격 + BOM 2.3.0 + `@cupia/ui` + Jenkins 게이트 + `customs-deploy` GitOps를 전제로 공수를 잡아야 한다.
  Nexus 접근 권한이 필수 전제조건이 된다.
- 산출물이 **독립 AI 서비스**로 납품될 것이라면 → `ai-team` 관행(FastAPI + Compose + 외부 vLLM 재사용)이
  선례이고, 플랫폼과는 REST로만 만나면 된다. 이 경우 프레임워크 재사용 이득은 사실상 없다.
- SOW의 "IP 공동 소유" 조항과도 맞물린다 — 플랫폼 트랙을 택하면 산출물이 CUPIA 사내 공통 코드에
  강하게 결합되어 분리 납품이 어려워진다.

---

## 8. 리스크 및 확인 필요 사항 (정리)

| # | 항목 | 영향 | 조치 |
|---|---|---|---|
| ① | Nexus 접근 권한 없음 | 프레임워크·MFE 로컬 빌드/구동 불가 (소스 열람만 가능) | 실행 검증이 필요하면 Nexus 계정 요청 |
| ② | 과제 1 대상 시스템(RAG Codex/PoC) 실물 위치 불명 | 4월 서비스 수준 진단 착수 불가 | 킥오프에서 코드 위치·접근 범위 확정 |
| ③ | EWACS 저장소·문서 부재 | 과제 2 요건 정의(4~5월) 착수 불가 | SOW 별첨 협의 항목으로 이미 등록됨 — 우선순위 상향 |
| ④ | 스택 선택 미결(§7.3) | 22 M/M 산정과 산출물 구조 전체가 갈림 | 착수 전 서면 확정 |
| ⑤ | 모델 라이선스 | NLLB/Seamless 계열 CC-BY-NC 이슈가 `uniterp`에 선례로 기록됨 | 과제 1·2 모델 선정 시 상업/정부배포 가능 라이선스 사전 확인 |
| ⑥ | 문서 신뢰도(§6) | README 근거 판단이 틀릴 수 있음 | 스펙 확정 시 `pom.xml`·실기동 실측 우선 |
| ⑦ | 자격증명 관행(§3.4 관찰 ①) | 협업 중 평문 자격증명 수수 가능성 | 우리 쪽 취급 기준을 먼저 정하고 협의 |
| ⑧ | 인력 집중 | `framework`·`customs`·`solutions` 커밋 대다수가 소수 개발자(특히 Slipknot Yang) 단독 | 질의 창구·의사결정 속도 리스크로 인지 |

---

## 부록 A. 저장소 인벤토리 (ncms 102개 제외 · 최근 2개월 커밋 수)

| 그룹 | 저장소 | id | 최근 2개월 커밋 | 비고 |
|---|---|---:|---:|---|
| framework/backend | cupia-framework | 3 | 100+ | 정본 프레임워크, Java 25 / SB 4.1 |
| framework/backend | cupia-examples | 6 | – | 예제 서비스 |
| framework/frontend | cupia-design-system | 9 | 100+ | `@cupia/ui` 0.10.5 |
| framework/frontend | cupia-frontend-libs | 19 | 62 | http/file/shell-shared |
| framework/infra | cupia-msa-infra | 25 | 0 | 동결 |
| framework/docs | cupia-framework-docs | 59 | 0 | 개발자 가이드 사이트 40p |
| framework/docs | cupia-epass-docs | 39 | – | 650MB 문서 덤프 |
| customs/docs | customs-docs | 18 | 100+ | 표준 SSOT |
| customs/domains | customs-portal | 54 | 100+ | admin/trade 대칭 모노레포 |
| customs/domains | customs-clearance | 43 | 100+ | P1 reference (README 없음, `CLAUDE.md`만) |
| customs/domains | customs-risk | 45 | 33 | 선별 판정 엔진 Phase 1 |
| customs/domains | customs-tariff | 70 | 96 | 세액계산 엔진 |
| customs/domains | customs-tariff-flow-rule-engine | 75 | 29 | BPM 룰 빌더(BRMS) |
| customs/domains | cupia-customs-domain-template | 77 | 8 | 신규 도메인 골격 |
| customs/domains | customs-cargo | 44 | 4 | **빈 골격** |
| customs/shells | customs-admin-shell / customs-trade-shell | 52 / 53 | 100+ / 100+ | MF 호스트 (3001 / 내·외부망) |
| customs/libs | customs-common | 42 | 30 | 참조데이터 read API |
| customs/libs | customs-frontend-libs | 56 | 68 | `@cupia/customs-common` |
| customs/libs | customs-keycloak-federation | 63 | – | Keycloak 연동 |
| customs/infra | customs-infra / customs-deploy | 27 / 29 | 77 / 100+ | 부트스트랩 / **ArgoCD 진실** |
| customs/support | config·discovery·config-repo·gateway ×3 | 46–51 | 소규모 | Spring Cloud |
| ai-team | customs-docs | 38 | 100+ | **UCR 서류 검증 — 과제 1 최근접** |
| ai-team | hs-classify-ai | 35 | 100+ | HS 분류 GraphRAG |
| ai-team | omnitrans | 79 | 100+ | 실시간 통역 중계 |
| ai-team | sentinel | 78 | 14 | **관제 Agent — 과제 2 참조** |
| ai-team | uniterp | 71 | – | 오프라인 통역기 |
| ai-team | prompt-engineering | 81 | 4 | Claude Code 설정 배포 |
| ai-team | customs-ai / keyword-filter | 37 / 36 | 0 / 0 | 동결 |
| ai-team | ai3-archive | 8 | – | 아카이브 |
| ai-team | ai / oracle-sql-tuner | 5 / 34 | – | 빈 저장소 |
| solutions | cupia-edx-v1 | 185 | 100+ | **최다 활동** (조사일 당일 커밋) |
| solutions | cupia-edx | 72 | 100+ | 구 버전 |
| solutions | cupia-meta | 69 | 100+ | MDMS 표준 관리 |
| solutions | cupia-ai-dev | 80 | 100+ | Claude Code 플러그인 마켓 |
| epass-react | sgw-trd / sgw-oga / sgw-cms-react | 40 / 41 / 61 | 0 / 0 / 0 | 동결, `node_modules` 커밋됨 |
| itzmehs | bi-sql-assistant | 64 | – | Text-to-SQL 데스크톱 |
| ncms | (102개) | – | 1건/저장소 | 2026-08-10 일괄 임포트, 동결 |

## 부록 B. 재조사 방법 (읽기 전용)

```bash
# 2시간 유효한 api 스코프 토큰 발급
curl -s -X POST https://git.cupia-framework.64bit.kr/oauth/token \
  -H "Content-Type: application/json" \
  -d '{"grant_type":"password","username":"<user>","password":"<password>"}'

# 프로젝트 전수 (페이지당 100건, 2페이지)
curl -s -H "Authorization: Bearer $T" \
  "https://git.cupia-framework.64bit.kr/api/v4/projects?per_page=100&order_by=last_activity_at"

# 파일 원문 (경로는 URL 인코딩: docs/x.md → docs%2Fx.md)
curl -s -H "Authorization: Bearer $T" \
  "https://git.cupia-framework.64bit.kr/api/v4/projects/<id>/repository/files/README.md/raw?ref=main"
```

자격증명은 이 문서에 적지 않는다. 조회 외 어떤 쓰기 API도 호출하지 않는다.
