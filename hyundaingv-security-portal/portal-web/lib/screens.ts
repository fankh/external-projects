/** 스텁 화면 카탈로그 — 제품안내서 LV3 화면 목록.
 *  권한은 components/chrome/menus.ts 의 NAV 가 단일 원천이고, 여기는 화면 설명·예정 기능만 담는다.
 *  화면을 실제 구현할 때는 해당 경로에 page.tsx 를 만들면 캐치올 스텁보다 우선한다. */

export interface StubScreen {
  desc: string
  features: { name: string; detail: string }[]
}

export const SCREENS: Record<string, StubScreen> = {
  '/board/notices': {
    desc: '전사 공지 게시판 — 공지 등록·조회와 필독 확인을 다룬다.',
    features: [
      { name: '공지 목록·조회', detail: '카테고리(공지·보안·시스템)·고정 공지, 첨부파일' },
      { name: '필독 확인', detail: '필독 공지 읽음 확인 및 커버리지 집계' },
      { name: '등록·수정', detail: '업무담당·Admin 등록, 게시 기간 관리' },
    ],
  },
  '/board/qna': {
    desc: '포털 업무 문의 게시판 — 질문 등록과 담당자 답변을 다룬다.',
    features: [
      { name: '질문 등록', detail: '업무 도메인 분류 선택, 첨부파일' },
      { name: '답변·상태', detail: '담당자 지정, 답변완료 상태 추적' },
    ],
  },
  '/finance/invest': {
    desc: 'IT 투자 관리 — 경영계획부터 정산·실적까지 투자 집행 전 주기.',
    features: [
      { name: '경영계획', detail: '연간 투자 계획 수립·결재 상신' },
      { name: '시행·계약내역', detail: '시행품의, 계약 내역 등록·첨부' },
      { name: '정산품의', detail: '집행 건 정산 결재 (엑셀양식 자동첨부)' },
      { name: '계획대비실적', detail: '계획 대비 집행 실적 조회·엑셀 다운로드' },
    ],
  },
  '/finance/expense': {
    desc: 'IT 비용 관리 — 경영계획·시행·속보·정산까지 비용 집행 전 주기.',
    features: [
      { name: '경영계획', detail: '연간 비용 계획 수립·결재 상신' },
      { name: '시행·계약내역', detail: '시행품의, 계약 내역 등록·첨부' },
      { name: '속보', detail: '월 마감 전 비용 집행 속보 집계' },
      { name: '정산품의·실적', detail: '정산 결재, 계획 대비 실적 조회·엑셀' },
    ],
  },
  '/finance/asset-reg': {
    desc: '자산등록 — 자산관리시스템 API 연계로 자산정보를 조회하고 신규 등록한다.',
    features: [
      { name: '자산정보 조회', detail: '자산관리시스템 API로 보유 자산 조회' },
      { name: '신규 자산등록', detail: '신규 자산등록번호 취득·등록 연계' },
    ],
  },
  '/sr/new': {
    desc: 'SR 신청 — 시스템개발·데이터·계정/권한 3종 요청을 작성하고 결재 상신한다.',
    features: [
      { name: '시스템개발 SR', detail: '등록→심의·결재→CI 배정→개발→테스트→적용요청→반영→완료' },
      { name: '데이터 SR', detail: '데이터 추출·정정 요청, 등록→결재→CI 배정→처리→완료' },
      { name: '계정/권한 SR', detail: '권한 부여·삭제, 계정 초기화·잠금해제' },
    ],
  },
  '/sr/requests': {
    desc: '신청내역 — 본인·부서의 SR 신청 건과 진행 상태를 추적한다.',
    features: [
      { name: '신청 목록', detail: 'SR번호·유형·시스템·상태·요청일 조회' },
      { name: '진행 추적', detail: '결재·CI 배정·개발·적용 단계별 상태' },
    ],
  },
  '/sr/ci': {
    desc: 'CI SR 관리 — BA 승인/반려와 CI 배정·착수를 처리한다.',
    features: [
      { name: 'BA 승인/반려', detail: '결재 완료 SR의 업무분석가 검토' },
      { name: 'CI 배정·착수', detail: '담당 CI 지정, 착수·예상 완료일 등록' },
    ],
  },
  '/sr/manage': {
    desc: 'SR 관리 — 접수·처리 이력과 전체 SR 파이프라인을 관리한다.',
    features: [
      { name: '접수·처리 이력', detail: '결재 없는 SR 접수·처리 이력 관리' },
      { name: '파이프라인', detail: '등록→결재→배정→개발→테스트→적용→완료 현황' },
    ],
  },
  '/sr/delayed': {
    desc: '지연내역 — 결재완료 SR 중 예정일을 넘긴 지연 건을 드러낸다.',
    features: [
      { name: '지연 목록', detail: '예상 완료일 경과 건, 지연일수·담당 CI' },
      { name: '조치', detail: '사유 등록, 완료일 재계획' },
    ],
  },
  '/infra/systems': {
    desc: '시스템·서버 현황 — 랙·H/W·서버·시스템(애플리케이션) 구성 현황.',
    features: [
      { name: '시스템별 현황', detail: '접속 URL·개발계/운영계·서버 매핑 — 애플리케이션 현황' },
      { name: '랙 · H/W · 서버', detail: '물리 구성·사양·위치 관리' },
    ],
  },
  '/infra/operations': {
    desc: '운영 관리 — 배치·인터페이스·디스크 사용 현황을 관리한다.',
    features: [
      { name: '배치관리', detail: '배치 잡 등록·실행 이력' },
      { name: '인터페이스관리', detail: '대내외 인터페이스 목록·연계 상태' },
      { name: '디스크현황', detail: '서버별 디스크 사용률 추적' },
    ],
  },
  '/infra/incidents': {
    desc: '장애관리 — 장애 등록·조치와 주기별 통계·대책 보고.',
    features: [
      { name: '장애 등록·조치', detail: '항목·등급·조치기준 공통코드화, 조치내역' },
      { name: '통계현황 보고', detail: '주기별 장애현황 취합·결재상신' },
      { name: '향후대책', detail: '대책 결과 등록·추적' },
    ],
  },
  '/infra/changes': {
    desc: '변경관리 — 인프라·시스템개발 변경의 계획/결과 상신.',
    features: [
      { name: '인프라변경관리', detail: '변경작업 등록·계획 상신·결과 등록' },
      { name: '시스템개발변경관리', detail: 'SR 적용요청 결재완료 건 연계' },
    ],
  },
  '/projects/status': {
    desc: '프로젝트 진행현황 — 진척과 인력투입을 관리한다.',
    features: [
      { name: '진행현황', detail: '진행률·예상/실제 완료일·공수·담당자' },
      { name: '인력투입', detail: '투입 인력 계획 등록·첨부 관리' },
    ],
  },
  '/projects/schedule': {
    desc: '일정·산출물·이슈 — 계획 대비 진척과 산출물·리스크 관리.',
    features: [
      { name: '일정/산출물', detail: '계획 일정 대비 진척, 필요 산출물 등록·점검 (첨부)' },
      { name: '이슈·리스크', detail: '프로젝트 이슈·리스크 등록·추적 (첨부)' },
    ],
  },
  '/projects/reports': {
    desc: '회의록·주간보고 — 프로젝트 커뮤니케이션 기록.',
    features: [
      { name: '회의록', detail: '회의록 등록·조회 (첨부)' },
      { name: '주간보고', detail: '프로젝트 주간보고 작성·조회 (첨부)' },
    ],
  },
  '/pledge/my': {
    desc: '보안서약서 제출 — 본인 서약서를 확인하고 온라인 동의한다.',
    features: [
      { name: '서약 동의', detail: '일반·관리책임자·재택근무·특별 서약서 온라인 동의' },
      { name: '연도별 양식', detail: '개정일자 기준 최신 양식으로 서약' },
      { name: '제출 이력', detail: '본인 서약 이력·상태 조회' },
    ],
  },
  '/pledge/dept': {
    desc: '부서 서약 현황 — 부서 단위 진행현황을 취합하고 미서약자를 관리한다.',
    features: [
      { name: '부서 진행현황', detail: '부서원 서약 상태 집계' },
      { name: '미서약 안내', detail: '입사·복직·개정 기준 미서약자 안내메일' },
    ],
  },
  '/pledge/manage': {
    desc: '전사 현황·양식관리 — 전사 서약 현황과 양식·업로드를 관리한다.',
    features: [
      { name: '전사 현황', detail: '부서·전사 진행현황, 협력업체 서약 포함' },
      { name: '보안담당자 관리', detail: '부서별 보안담당자 지정' },
      { name: '스캔본 업로드', detail: '서면 서약 스캔본 등록' },
      { name: '양식관리', detail: '서약서 양식(HTML·개정일자) 버전 관리' },
    ],
  },
  '/awareness/remote': {
    desc: '재택근무 체크리스트 — 재택근무 보안 점검 항목을 제출·취합한다.',
    features: [
      { name: '체크리스트 제출', detail: '재택근무자 보안 점검 항목 자가점검' },
      { name: '현황 취합', detail: '부서·전사 제출 현황 집계' },
    ],
  },
  '/awareness/prints': {
    desc: '출력물 개인정보관리 — 출력물 폐기현황을 상신·집계한다.',
    features: [
      { name: '폐기현황 상신', detail: '목록 체크 상신, 엑셀양식 자동첨부' },
      { name: '부서 취합', detail: '상신일자·결재상태, 부서 단위 취합' },
    ],
  },
  '/awareness/violations': {
    desc: '보안위반 관리 — 위반 사실 등록과 사실확인서를 다룬다.',
    features: [
      { name: '위반 등록', detail: '위반 유형·조치 등록' },
      { name: '사실확인서', detail: '보안위반 사실확인서 작성·결재' },
    ],
  },
  '/compliance/education': {
    desc: '보안교육 — 연간계획·결과·이수현황을 관리한다.',
    features: [
      { name: '연간계획·결과', detail: '교육 계획 수립·실시 결과 등록' },
      { name: '이수현황', detail: '개인·부서 이수율 집계' },
      { name: '게시이력', detail: '교육 자료 게시 이력' },
    ],
  },
  '/compliance/inspection': {
    desc: '보안점검 (ISMS) — 기준관리·점검계획·진행내역을 다룬다.',
    features: [
      { name: '기준관리', detail: 'ISMS 통제 항목·점검 기준 관리' },
      { name: '점검계획', detail: '연간 점검 계획 수립·결재' },
      { name: '진행내역', detail: '점검 수행·결함 조치 추적' },
    ],
  },
  '/settings/users': {
    desc: '사용자·그룹·결재선 — 계정과 권한그룹, 결재선을 관리한다.',
    features: [
      { name: '사용자 관리', detail: '인사정보 연동 계정, 권한그룹 지정' },
      { name: '결재선 관리', detail: '업무별 기본 결재선 구성' },
    ],
  },
  '/settings/menus': {
    desc: '메뉴·기능 관리 — 포털 메뉴 체계와 화면 내 기능 단위를 관리한다.',
    features: [
      { name: '메뉴 관리', detail: 'LV1~LV3 메뉴 등록·정렬·사용 여부' },
      { name: '기능 관리', detail: '화면 내 버튼·기능 단위 정의' },
    ],
  },
  '/settings/permissions': {
    desc: '메뉴권한 — 권한그룹 × 메뉴·기능 매트릭스를 관리한다.',
    features: [
      { name: '권한 매트릭스', detail: '그룹별 메뉴 접근·기능 사용 권한' },
      { name: '서버사이드 가드', detail: '직접 URL 진입 차단과 동일 기준 적용' },
    ],
  },
  '/settings/codes': {
    desc: '공통코드·객체 — 업무 공통코드와 코드 객체를 관리한다.',
    features: [
      { name: '공통코드', detail: '코드그룹·코드값 관리 (장애등급·SR유형 등)' },
      { name: '객체 관리', detail: '코드 참조 객체 매핑' },
    ],
  },
  '/settings/forms': {
    desc: '엑셀양식 관리 — 결재 자동첨부에 쓰는 엑셀 양식을 관리한다.',
    features: [
      { name: '양식 등록', detail: '업무별 엑셀 양식 업로드·버전 관리' },
      { name: '자동첨부 매핑', detail: '결재 문서 유형별 양식 연결' },
    ],
  },
  '/platform/integrations': {
    desc: '연동·인프라 — 사내 시스템 연동 채널과 기반 설정을 관리한다.',
    features: [
      { name: '이메일·문자 연동', detail: '안내메일·문자 발송 게이트웨이' },
      { name: '인사정보 연동', detail: '조직·인사 일배치 동기화' },
      { name: 'SSO (SAML)', detail: 'IdP 연동·인증 설정' },
      { name: '자산관리 API · 그룹웨어', detail: '자산정보 조회·결재 연계' },
      { name: '서버세팅·보안성 검토', detail: 'WAS·DB암호화·시큐어코딩 점검 항목' },
    ],
  },
}
