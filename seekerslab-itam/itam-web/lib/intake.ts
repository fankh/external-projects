import type { AssetCategory } from './types'

/** 유형별 입고 검수 체크리스트 — 자산 유형에 맞는 검수 항목.
 *  서버는 전원 이중화·RAID·관리포트, 단말은 디스크 암호화·시리얼 각인 등 유형 고유 검수를 포함한다.
 *  (제품안내서 §03 도입: 발주 연계 입고 등록·검수 체크리스트) */
const COMMON_HEAD = ['발주 사양 일치 (수량·모델)', '외관 손상·스크래치 확인']
const COMMON_TAIL = ['자산 라벨 부착 위치 확인']

const CHECKLIST_BY_CATEGORY: Record<AssetCategory, string[]> = {
  단말: [...COMMON_HEAD, '전원·부팅 정상 동작', '사양 일치 (CPU·메모리·SSD)', 'OS·보안 SW 설치 상태', '디스크 암호화(BitLocker/FileVault) 활성화', '시리얼 각인·발주 대조', '부속품 구성 (어댑터·케이블)', ...COMMON_TAIL],
  서버: [...COMMON_HEAD, '랙 마운트 부속·케이블 정리', '전원 이중화(PSU)·팬 정상 동작', 'RAID·디스크 구성 확인', 'iDRAC/IPMI 관리 포트·펌웨어 버전', 'OS·보안 SW 설치 상태', '시리얼 각인·발주 대조', ...COMMON_TAIL],
  네트워크: [...COMMON_HEAD, '포트·인터페이스 수량 확인', '펌웨어 버전·콘솔 접근', '전원·팬 정상 동작', '시리얼 각인·발주 대조', ...COMMON_TAIL],
  주변기기: [...COMMON_HEAD, '전원·기본 동작 확인', '소모품·부속품 상태', '시리얼 각인·발주 대조', ...COMMON_TAIL],
  SW: ['발주 라이선스 수량·에디션 일치', '라이선스 키·계정 수령', '설치·인증 상태 확인'],
  가상자원: ['발주 사양(vCPU·메모리·스토리지) 일치', '이미지·OS 템플릿 확인', '보안 그룹·접근 통제 설정'],
}

/** 유형별 검수 체크리스트 항목 — 미정의 유형은 단말 기준으로 폴백. */
export function checklistFor(category: AssetCategory): string[] {
  return CHECKLIST_BY_CATEGORY[category] ?? CHECKLIST_BY_CATEGORY['단말']
}
