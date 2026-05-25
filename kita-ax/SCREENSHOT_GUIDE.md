# Access Policies 스크린샷 캡처 가이드

**대상 슬라이드:** Slide 19 (ABAC 보호 — 속성 기반 동적 제어)  
**필수 정보:** 역할 × 분류등급 권한 매트릭스  
**저장 위치:** `/home/khchoi/external-projects/kita-ax/screenshots/access_policies.png`

---

## 1️⃣ 캡처 대상 확인

**URL:** `https://kyra-guardrail-dev.seekerslab.com/admin/documents`

### 캡처해야 할 화면 (우선순위)

#### 필수 (Priority 1)
**Admin Console → Documents → Access Policies 탭**
- 역할 × 분류등급 권한 체크박스 매트릭스
- 행(row): admin, manager, power_user, user, viewer
- 열(column): public, internal, confidential, restricted
- 각 셀: ☑ (체크) 또는 ☐ (미체크) 표시

**이상적인 화면 구성:**
```
┌─────────────────────────────────────────────────────┐
│ Access Policies                          [필터] [저장]│
├─────────────────┬────────┬─────────┬────────┬─────────┤
│ 역할/분류등급   │ Public │ Internal│ Confidl│ Restrict│
├─────────────────┼────────┼─────────┼────────┼─────────┤
│ Admin           │   ☑    │    ☑    │   ☑    │    ☑   │
│ Manager         │   ☑    │    ☑    │   ☑    │    ☐   │
│ Power User      │   ☑    │    ☑    │   ☐    │    ☐   │
│ User            │   ☑    │    ☑    │   ☐    │    ☐   │
│ Viewer          │   ☑    │    ☐    │   ☐    │    ☐   │
└─────────────────┴────────┴─────────┴────────┴─────────┘
```

#### 권장 (Priority 2)
**Document Library 탭** — 분류등급 배지가 보이는 문서 목록
- 각 문서의 classification 레이블: `[public]`, `[internal]`, `[confidential]`, `[restricted]`
- 추가 캡처 시 Slide B에 추가할 수 있음

---

## 2️⃣ 스크린샷 촬영 방법

### 옵션 A: 맥 (Mac)

**기본 스크린샷 (전체 화면)**
```bash
Cmd + Shift + 3
```
→ 데스크톱에 `Screenshot YYYY-MM-DD at HH.MM.SS.png` 저장

**선택 영역만 캡처**
```bash
Cmd + Shift + 4
→ 드래그해서 필요한 영역만 선택
```

**윈도우만 캡처** (권장)
```bash
Cmd + Shift + 4 → Space → 윈도우 클릭
→ Access Policies 테이블 윈도우만 캡처
```

### 옵션 B: Linux

**GNOME 스크린샷 도구**
```bash
gnome-screenshot
# 또는 3초 후 캡처
gnome-screenshot --delay=3
```

**선택 영역만**
```bash
gnome-screenshot --area
```

**커맨드라인 고급 옵션**
```bash
import -pause 3 screenshot.png
# (ImageMagick 필요)
```

### 옵션 C: Windows

**기본**
- `PrtScn` → 클립보드 복사 → Paint 또는 이미지 에디터에서 `Ctrl+V` → 저장
- `Win + Shift + S` → 선택 영역 드래그 → 클립보드 복사

**F12 개발자 도구 활용**
```
F12 → DevTools 열기
Ctrl + Shift + P → "Capture screenshot" 검색 → Enter
```

### 옵션 D: 브라우저 개발자 도구 (모든 OS)

1. `F12` 또는 `Cmd+Option+I` (Mac) 또는 `Ctrl+Shift+I` (Linux/Win) 열기
2. 상단 메뉴: `⋯` (Three dots) → **Capture screenshot** (또는 Capture node screenshot)
3. 대상 요소 선택 또는 전체 캡처

---

## 3️⃣ 캡처 완료 후 처리

### 파일명 확인
- **파일명:** `access_policies.png` (소문자, 언더스코어 사용)
- **형식:** PNG 또는 JPG
- **해상도:** 최소 800x600 (권장 1200x800 이상)
- **파일 크기:** 일반적으로 100KB~500KB

### 파일 이동

```bash
# 현재 위치에서 이동 (예: 다운로드 폴더 → kita-ax/screenshots/)
mv ~/Downloads/Screenshot\ 2026-05-25\ at\ 14.30.45.png \
   /home/khchoi/external-projects/kita-ax/screenshots/access_policies.png

# 또는 복사 후 이동
cp [현재_파일_경로] /home/khchoi/external-projects/kita-ax/screenshots/access_policies.png
```

### 최종 확인

```bash
# 파일 존재 여부 확인
ls -lah /home/khchoi/external-projects/kita-ax/screenshots/

# 결과 예상:
# -rw-r--r-- 1 khchoi khchoi 234K May 25 14:35 access_policies.png
```

---

## 4️⃣ 문제 해결

### 404 화면이 뜰 경우
- 로그인 상태 확인: `https://kyra-guardrail-dev.seekerslab.com/chat`에서 먼저 로그인
- 관리자 권한 확인: admin 계정으로 로그인 필요
- 개발 서버 상태 확인: 방화벽 또는 네트워크 연결 이슈 확인

### 관리 콘솔에 Access Policies 탭이 없을 경우
- Documents 페이지에 3개 탭이 있어야 함:
  1. **Document Library** (좌측)
  2. **Access Policies** (중앙) ← 이것!
  3. **Collections** (우측)
- 탭이 없으면 브라우저 새로고침 또는 캐시 삭제 후 다시 접속

### 이미지 품질이 낮을 경우
- 브라우저 줌 레벨 확인 (100% 권장, 125% 이상 권장 안 함)
- 다시 캡처할 때 더 큰 모니터/화면 해상도 사용
- PNG 형식 사용 (JPG보다 선명함)

---

## 5️⃣ 캡처 후 연락처

**파일이 준비되면:**

```bash
# 체크: 파일이 올바른 위치에 있는지 확인
file /home/khchoi/external-projects/kita-ax/screenshots/access_policies.png
# 결과 예: "PNG image data, 1200 x 800..."

# 파일 크기 확인
du -h /home/khchoi/external-projects/kita-ax/screenshots/access_policies.png
# 결과 예: "234K"
```

파일 준비 완료 후 알려주시면 **Slide 19에 자동 삽입되고 PDF 재생성** 처리됩니다.

---

## 📌 체크리스트

- [ ] `https://kyra-guardrail-dev.seekerslab.com/admin/documents` 접속 확인
- [ ] Admin 계정으로 로그인 확인
- [ ] **Access Policies 탭** 클릭
- [ ] 역할 × 분류등급 권한 매트릭스 화면 캡처
- [ ] 파일명 `access_policies.png`로 저장
- [ ] `/home/khchoi/external-projects/kita-ax/screenshots/` 폴더에 이동
- [ ] 파일 존재 여부 확인: `ls -lah /home/khchoi/external-projects/kita-ax/screenshots/`
- [ ] 완료 후 경로 전달

---

**대기 중 파일:** 현재 placeholder 사용 중  
**최종 마감:** 5/26(화) 09:00 이전  
**예상 소요 시간:** 약 5분 (접속 + 캡처 + 파일 이동)
