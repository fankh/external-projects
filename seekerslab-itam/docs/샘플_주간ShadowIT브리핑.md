# 주간 Shadow IT 브리핑 (2026-07-29)

> 2026-07-29 · 규칙 생성 · 박자산 · 생성일 2026-07-29

이번 주 편입 대상 미등록 자산은 7건이며, 이 중 위험도 높음은 3건입니다. 외부 공격표면에서는 미등록 노출 자산 4건이 확인되었으며 CVE가 확인된 자산이 2건 포함됩니다. 미인가 SaaS는 4종으로, 소유자 확인 후 편입 또는 차단 판정이 필요합니다. 인증·계정·엔드포인트 위생에서는 크리덴셜 노출 4건·휴면 계정 4건·미인가 SW 4건·USB 매체 3건·로컬 VM 3건이 미조치 상태로, 보안담당의 차단·제거·회수·비활성화·소유자 확인 조치가 필요합니다.

## 신규 발견 미등록 자산

_편입 대상 7건 — 위험도 높음 3건 (관리 제외·격리 요청 제외)_

| 발견 ID | 호스트명 | 유형 | 채널 | 위험도 | 처리 상태 |
|---|---|---|---|---|---|
| DSC-2607-0041 | ip-10-20-31-88 | 단말 (Windows) | 네트워크 능동 스캔 | 높음 | 확인요청 |
| DSC-2607-0042 | nas-dev-team | NAS | 패시브 트래픽 | 높음 | 미처리 |
| DSC-2607-0046 | DESKTOP-UNK09 | 단말 (Windows) | 네트워크 능동 스캔 | 높음 | 미처리 |
| DSC-2607-0038 | ESP-9F31A2 | IoT 장비 | 패시브 트래픽 | 중간 | 확인요청 |
| DSC-2607-0035 | i-0f3a91c2d8 | AWS EC2 (t3.large) | 클라우드 API | 중간 | 미처리 |
| DSC-2607-0044 | oauth-app:notion-sync | OAuth 앱 | AD/IdP·SSO 로그 | 중간 | 미처리 |
| DSC-2607-0045 | nas-dev-team | NAS | 패시브 트래픽 | 중간 | 미처리 |

## 외부 공격표면 노출

_외부 노출 10건 중 미조치 미등록 4건, CVE 확인 2건_

| 호스트 | 발견 방법 | 노출 서비스 | CVE | 위험도 |
|---|---|---|---|---|
| legacy-vpn.seekerslab.co.kr | 인증서 투명성 (CT) | HTTPS 443 (Fortinet SSL-VPN 6.0.4) | CVE-2018-13379 | 높음 |
| dev-api.seekerslab.co.kr | 서브도메인 브루트포스 | HTTP 8080 (Swagger UI 노출) | - | 높음 |
| stg.seekerslab.co.kr | 순열 생성 (환경 접두) | HTTPS 443 (Basic 인증) | - | 중간 |
| kiosk-cam.seekerslab.co.kr | 검색엔진 도킹 | HTTP 80 (관리 콘솔) | - | 중간 |

## 미인가 SaaS 사용

_미인가 4종 · 추정 사용자 261명_

| 서비스 | 분류 | 주 사용 부서 | 추정 사용자 | 위험도 |
|---|---|---|---|---|
| Notion | 협업 | 마케팅팀 | 28 | 중간 |
| ChatGPT | AI | 전사 | 212 | 높음 |
| Miro | 협업 | 플랫폼개발팀 | 9 | 낮음 |
| GitLab | 개발 | 플랫폼개발팀 | 12 | 중간 |

## 인증 · 계정 · 엔드포인트 정책 위반

_크리덴셜 노출 4 · 휴면 계정 4 · 미인가 SW 4 · USB 매체 3 · 로컬 VM 3 (전건 미조치)_

| 구분 | 대상 | 상세 | 위험도 | 조치 상태 |
|---|---|---|---|---|
| 크리덴셜 노출 | PostgreSQL db-backup.seekerslab.co.kr | 기본 크리덴셜 | 높음 | 미조치 |
| 크리덴셜 노출 | HTTP Basic stg.seekerslab.co.kr | 약한 암호 | 중간 | 미조치 |
| 크리덴셜 노출 | Redis cache-ext.seekerslab.co.kr | 인증 없음 | 높음 | 미조치 |
| 크리덴셜 노출 | SSH dev-api.seekerslab.co.kr | 기본 크리덴셜 | 중간 | 미조치 |
| 휴면 계정 | sh.oh | 휴면 사용자 계정 · 165일 | 중간 | 미처리 |
| 휴면 계정 | svc-legacy-batch | 미사용 서비스 계정 · 268일 | 높음 | 미처리 |
| 휴면 계정 | admin.tmp | 휴면 관리자 계정 · 190일 | 높음 | 미처리 |
| 휴면 계정 | jh.lim | 휴면 사용자 계정 · 로그인 이력 없음 | 중간 | 미처리 |
| 미인가 SW | uTorrent @ AST-2025-000512 | 금지 SW | 높음 | 미조치 |
| 미인가 SW | AnyDesk @ AST-2023-000113 | 무단 원격제어 | 높음 | 미조치 |
| 미인가 SW | Adobe Photoshop 2021 (크랙) @ AST-2022-000871 | 금지 SW | 높음 | 미조치 |
| 미인가 SW | Notion Desktop @ AST-2025-000512 | 미승인 SW | 중간 | 미조치 |
| USB 저장매체 | Samsung T7 SSD (S5RT·1TB) @ AST-2023-000113 | 대용량 반출 의심 | 높음 | 미조치 |
| USB 저장매체 | SanDisk Ultra (128GB) @ AST-2025-000512 | 미등록 저장매체 | 중간 | 미조치 |
| USB 저장매체 | Kingston DataTraveler (64GB) @ AST-2022-000871 | 암호화 미적용 | 중간 | 미조치 |
| 로컬 VM | VMware Workstation · dev-sandbox @ AST-2023-000113 | 미인가 하이퍼바이저 · Ubuntu 22.04 | 중간 | 미조치 |
| 로컬 VM | VirtualBox · legacy-test @ AST-2022-000871 | EOL·미패치 게스트 · Windows 7 | 높음 | 미조치 |
| 로컬 VM | KVM · unregistered-guest @ AST-2020-000883 | 미관리 VM · CentOS 7.9 | 중간 | 미조치 |

## 조치 현황

- 편입 요청 0건 · 격리 요청 1건
- 외부·엔드포인트 위협 미조치 — 크리덴셜 노출 4 · IOC 상관 3 · 휴면 계정 4 · 미인가 SW 4 · USB 매체 3 · 로컬 VM 3 · 다크웹 유출 4
- 결재 대기 13건
- 활성 탐지 채널 6/6
