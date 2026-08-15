---
marp: true
theme: default
paginate: true
backgroundColor: #fff
style: |
  section {
    font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
  }
  h1 {
    color: #1B2838;
  }
  h2 {
    color: #2E5090;
  }
  table {
    font-size: 0.8em;
  }
  .success {
    color: #28a745;
  }
  .warning {
    color: #ffc107;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
---

<!-- _class: lead -->
<!-- _backgroundColor: #1B2838 -->
<!-- _color: white -->

# Seekurity SIEM 구축 프로젝트

## 완료 보고서

**[고객사명]**
YYYY-MM-DD

---

# 목차

1. 프로젝트 개요
2. 수행 결과 요약
3. 구축 현황
4. 연동 현황
5. 탐지 시나리오
6. 테스트 결과
7. 산출물
8. 유지보수 안내

---

# 1. 프로젝트 개요

## 프로젝트 정보

| 항목 | 내용 |
|------|------|
| 프로젝트명 | Seekurity SIEM 구축 |
| 고객사 | [고객사명] |
| 계약 기간 | YYYY-MM-DD ~ YYYY-MM-DD |
| 실제 기간 | YYYY-MM-DD ~ YYYY-MM-DD |
| 수행사 | Seekurity |

## 프로젝트 목표

- 통합 보안 관제 시스템(SIEM) 구축
- 실시간 보안 위협 탐지 및 대응 체계 마련
- 보안 로그 통합 수집 및 분석 환경 구축

---

# 2. 수행 결과 요약

## 전체 결과: <span class="success">완료</span>

<div class="columns">
<div>

### 주요 성과
- SIEM 시스템 구축 완료
- Log Source 연동: **00대**
- 탐지 시나리오: **00개**
- 대시보드: **00개**

</div>
<div>

### 일정 준수율

| 구분 | 계획 | 실적 | 결과 |
|------|------|------|------|
| 착수 | W1 | W1 | O |
| 설계 | W5 | W5 | O |
| 구축 | W10 | W10 | O |
| 완료 | W18 | W18 | O |

</div>
</div>

---

# 2. 수행 결과 요약 (계속)

## 단계별 수행 결과

| Phase | 기간 | 주요 활동 | 결과 |
|-------|------|----------|------|
| 준비 | W1-W2 | Kickoff, 환경 분석, 요구사항 정의 | 완료 |
| 설계 | W3-W5 | 아키텍처/연동/시나리오 설계 | 완료 |
| 구축 | W6-W10 | 서버 설치, 연동, 룰 개발 | 완료 |
| 테스트 | W11-W14 | 단위/통합/성능 테스트 | 완료 |
| 안정화 | W15-W18 | 운영 이관, 교육, 안정화 | 완료 |

---

# 3. 구축 현황

## 시스템 구성

| 서버명 | IP | 역할 | 사양 |
|--------|-----|------|------|
| SIEM Manager | x.x.x.x | Manager / OpenSearch | CPU/RAM/Disk |
| SIEM Collector | x.x.x.x | Log Collector | CPU/RAM/Disk |

## 서비스 Port

| Service | Port | 용도 |
|---------|------|------|
| Nginx | 443 | Web UI (HTTPS) |
| SS-API | 23001 | REST API |
| SS-Syslog-Receiver | 514/UDP | Syslog 수신 |
| OpenSearch | 19200 | 검색 API |

---

# 4. 연동 현황

## Log Source 연동 결과

| 분류 | 장비 | 계획 | 실적 | 결과 |
|------|------|------|------|------|
| Network Security | Firewall | 0 | 0 | O |
| Network Security | IPS/IDS | 0 | 0 | O |
| Network Security | VPN | 0 | 0 | O |
| Endpoint Security | Windows Server | 0 | 0 | O |
| Endpoint Security | Linux Server | 0 | 0 | O |
| Data & Application | Database | 0 | 0 | O |
| **합계** | | **00** | **00** | **100%** |

---

# 4. 연동 현황 (계속)

## Log 수집 현황

### 일일 수집량
- 평균: **00 GB/day**
- 최대: **00 GB/day**

### EPS (Events Per Second)
- 평균: **0,000 EPS**
- 피크: **0,000 EPS**

### 수집률
- 목표: 99%
- 실적: **99.x%** <span class="success">달성</span>

---

# 5. 탐지 시나리오

## 탐지 룰 현황

| 분류 | 시나리오 | 수량 |
|------|----------|------|
| 인증/접근 | 로그인 실패, 권한 상승, 비인가 접근 | 0개 |
| 네트워크 | 포트 스캔, DDoS, C&C 통신 | 0개 |
| 악성코드 | 악성코드 탐지, 랜섬웨어 | 0개 |
| 데이터 유출 | 대량 데이터 전송, 비정상 시간 접속 | 0개 |
| 시스템 | 설정 변경, 서비스 중단 | 0개 |
| **합계** | | **00개** |

---

# 5. 탐지 시나리오 (계속)

## 주요 탐지 시나리오

| No. | 시나리오 | MITRE ATT&CK | 심각도 |
|-----|----------|--------------|--------|
| 1 | Brute Force 로그인 시도 | T1110 | High |
| 2 | 관리자 계정 비정상 접속 | T1078 | Critical |
| 3 | 포트 스캔 탐지 | T1046 | Medium |
| 4 | 악성 IP 통신 탐지 | T1071 | High |
| 5 | 대용량 파일 외부 전송 | T1048 | High |
| 6 | 비정상 시간대 접속 | T1078 | Medium |
| 7 | 권한 상승 시도 | T1068 | High |
| 8 | 설정 파일 변경 탐지 | T1562 | Medium |

---

# 6. 테스트 결과

## 테스트 요약

| 테스트 유형 | 항목 수 | Pass | Fail | 결과 |
|-------------|---------|------|------|------|
| 단위 테스트 | 00 | 00 | 0 | Pass |
| 통합 테스트 | 00 | 00 | 0 | Pass |
| 성능 테스트 | 00 | 00 | 0 | Pass |
| FVT | 00 | 00 | 0 | Pass |
| **합계** | **00** | **00** | **0** | **Pass** |

---

# 6. 테스트 결과 (계속)

## 성능 테스트 결과

| 항목 | 목표 | 결과 | 판정 |
|------|------|------|------|
| 검색 응답 시간 | 5초 이내 | 0.0초 | <span class="success">Pass</span> |
| 대시보드 로딩 | 3초 이내 | 0.0초 | <span class="success">Pass</span> |
| EPS 처리 | 10,000 EPS | 00,000 EPS | <span class="success">Pass</span> |
| 시스템 가용성 | 99.9% | 99.x% | <span class="success">Pass</span> |

---

# 7. 산출물

## 제출 산출물 목록

| No. | 산출물 | 형식 | 제출일 | 비고 |
|-----|--------|------|--------|------|
| 1 | 프로젝트 수행 계획서 | PPT | YYYY-MM-DD | |
| 2 | SOW (작업명세서) | XLSX | YYYY-MM-DD | |
| 3 | 요구사항 정의서 | XLSX | YYYY-MM-DD | |
| 4 | 로그 연동 설계서 | XLSX | YYYY-MM-DD | |
| 5 | 방화벽 정책 요청서 | XLSX | YYYY-MM-DD | |
| 6 | 탐지 시나리오 정의서 | XLSX | YYYY-MM-DD | |
| 7 | 운영자 매뉴얼 | PDF | YYYY-MM-DD | |
| 8 | 완료 보고서 | PPT | YYYY-MM-DD | 본 문서 |

---

# 8. 유지보수 안내

## 유지보수 정보

| 항목 | 내용 |
|------|------|
| 유지보수 기간 | YYYY-MM-DD ~ YYYY-MM-DD (1년) |
| 지원 범위 | 장애 대응, 기술 지원, 패치 적용 |
| 지원 시간 | 평일 09:00 ~ 18:00 |
| 연락처 | support@seekurity.com |

## 장애 대응 프로세스

1. 장애 접수 (이메일/전화)
2. 원격 진단 (1시간 이내)
3. 조치 및 복구
4. 결과 보고

---

# 8. 유지보수 안내 (계속)

## 운영 권장 사항

### 일일 점검
- 시스템 상태 확인
- 디스크 사용량 확인
- Log 수집 현황 모니터링

### 주간 점검
- 탐지 룰 동작 확인
- 알람 현황 검토
- 성능 지표 확인

### 월간 점검
- 보안 패치 적용
- 룰 튜닝 및 최적화
- 용량 계획 검토

---

<!-- _class: lead -->
<!-- _backgroundColor: #1B2838 -->
<!-- _color: white -->

# 감사합니다

## 프로젝트 완료

**Seekurity SIEM**
www.seekurity.com

support@seekurity.com

