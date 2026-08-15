# 표준 구성 / 3rd-party 분리 원칙 (아키텍처 보호)

표준 아키텍처를 보호하기 위해 Seekurity SIEM의 표준 구성요소와 고객별 3rd-party 통합을 분리하여 관리한다. 모든 산출물·패키지·문서 작성 시 이 원칙을 따른다.

## 1. 표준 구성 (Standard)

표준은 제품이 공식적으로 제공·지원하는 범위이며, 기준은 `versions.json`이다.

### 1.1 표준 컴포넌트 (versions.json 기준, v3.4.4)

| 컴포넌트 | 역할 |
|----------|------|
| api | REST API |
| console | 웹 콘솔 |
| log-stream | 로그 스트림 처리 |
| syslog-receiver | Syslog 수신 (514/UDP) |
| playbook-stream | 플레이북 자동 대응 |
| snmp-collector | SNMP 수집 |
| packet-receiver | Agent 수집 |
| database-checker | DB 수집·모니터링 |
| snmp-trap-sender | SNMP Trap 송신 |

### 1.2 표준 로그 수집 방식

| 방식 | 포트 | 컴포넌트 |
|------|------|----------|
| Syslog | 514/UDP | syslog-receiver |
| Agent (Seekurity Agent) | - | packet-receiver |
| SNMP / Trap | 161 / 162 UDP | snmp-collector / snmp-trap-sender |
| Database (JDBC) | 대상 DB 포트 | database-checker |

Linux 서버 로그의 표준 경로는 rsyslog → 514이다 (`docs/linux-log-integration.md`).

### 1.3 표준 관리 규칙

- 설치 패키지(Full/Patch)는 `scripts/build_installer.py`로만 생성하며, 위 표준 컴포넌트와 프레임워크(Kafka/OpenSearch/Java/Node.js)만 포함한다.
- 3rd-party 에이전트·바이너리는 표준 패키지에 포함하지 않는다.
- 표준 문서(`INSTALLATION_GUIDE.md`, `projects/_template/`, `docs/`의 공통 가이드)에는 3rd-party를 표준 옵션처럼 기술하지 않는다. 필요 시 "조건부/고객 전용"으로 명시한다.

## 2. 3rd-party 통합 (Customer-specific)

특정 고객이 표준 외의 방식을 요구하는 경우에만 도입하는 비표준 통합이다.

### 2.1 현재 3rd-party 항목

| 항목 | 고객 | 사유 | 위치 |
|------|------|------|------|
| Filebeat (Elastic Beats) | AIG | 고객사 3rd-party 에이전트 사용 요구 | `projects/aig/AIG_08-Filebeat설치매뉴얼.md` |

### 2.2 3rd-party 관리 규칙

- 3rd-party 산출물은 해당 고객 폴더(`projects/{고객사}/`) 안에서만 관리하고, 표준 문서·템플릿·패키지로 승격하지 않는다.
- 문서에는 "제품 표준 구성요소가 아님"과 도입 사유(고객 요구)를 명시한다.
- 표준 아키텍처 변경(예: Kafka `advertised.listeners` 재구성)이 필요한 3rd-party 경로는 SIEM Engineer의 검토·승인을 거친다.
- 신규 3rd-party 도입 시 본 문서 2.1 목록에 등재한다.

## 3. 판단 기준 (요약)

| 구분 | 표준 | 3rd-party |
|------|------|-----------|
| 정의 기준 | versions.json 컴포넌트 | 고객 요구로 도입한 외부 요소 |
| 패키지 포함 | 포함 | 미포함 (고객 폴더에서 별도 관리) |
| 문서 위치 | 공통 docs / _template | projects/{고객사}/ |
| 아키텍처 변경 | 표준 릴리스 절차 | SIEM Engineer 승인 필요 |
