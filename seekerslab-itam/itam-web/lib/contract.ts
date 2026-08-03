import type { Contract, ContractDocType } from './types'

/** 계약 유형별 필수 부속서류 — 구매는 계약서·세금계산서(회계 증빙), 유지보수는 계약서.
 *  근거 문서 없이 진행 중인 계약은 감사 리스크(제품안내서 §03 구매 계약: 부속서류 관리). */
const REQUIRED_DOCS: Record<Contract['kind'], ContractDocType[]> = {
  구매: ['계약서', '세금계산서'],
  유지보수: ['계약서'],
}

/** 미비(누락) 필수 부속서류 — 해지 계약은 대상 제외(종료분이라 보완 실익 없음). */
export function missingContractDocs(c: Contract): ContractDocType[] {
  if (c.status === '해지') return []
  const req = REQUIRED_DOCS[c.kind] ?? ['계약서']
  return req.filter((d) => !(c.documents ?? []).some((x) => x.docType === d))
}
