/** AI 실행 환경별 외부 반출 통제 — 제품안내서 §05 "AI 실행 환경 옵션".
 *  온프레미스 LLM: 자산 데이터 외부 반출 없음. 외부 API 연계: 비식별 처리 후 상용 LLM API.
 *  하이브리드: 분류·질의는 온프레미스, 대량 배치 분석만 선별 외부(대화형 질의는 외부 반출 없음).
 *  화면·어시스턴트·감사가 같은 판정을 공유하도록 한 곳에 둔다(정책 표시와 실제 강제가 어긋나지 않게). */
import type { AiPolicy } from './types'

/** 대화형 질의(어시스턴트)의 외부 LLM 반출 허용 여부.
 *  온프레미스·하이브리드는 대화형 질의를 온프레미스 처리하므로, 외부 반출은 '외부 API 연계'에서만 허용한다.
 *  이 판정으로 askAssistant 가 외부 API 호출 자체를 차단하므로 키가 설정돼 있어도 반출되지 않는다. */
export function externalQueryAllowed(deployment: AiPolicy['deployment']): boolean {
  return deployment === '외부 API 연계'
}

/** 실행 환경별 외부 반출·비식별 처리 정책 서술(화면·감사 공용) — 정책 표시가 실제 강제와 일치. */
export function egressPolicy(deployment: AiPolicy['deployment']): { egress: '차단' | '허용'; deidentify: boolean; note: string } {
  if (deployment === '외부 API 연계') {
    return { egress: '허용', deidentify: true, note: '외부 상용 LLM API 사용 — 개인 식별자·IP·MAC·이메일 비식별 처리 후 반출' }
  }
  if (deployment === '하이브리드') {
    return { egress: '차단', deidentify: false, note: '대화형 질의·분류는 온프레미스 처리 — 대량 배치 분석만 선별 외부(질의 외부 반출 없음)' }
  }
  return { egress: '차단', deidentify: false, note: '온프레미스 처리만 — 자산 데이터 외부 반출 없음(망분리 기본안)' }
}

/** 사람 이름인가 — 조직 단위(팀·본부·전사)와 자리표시자는 개인 식별자가 아니고, 분류·집계 품질을 위해
 *  그대로 둔다(정책이 '자산 분류·상태·부서·모델·수치는 보존'이라 밝힌 그대로). */
export function isPersonName(v?: string): boolean {
  const t = (v ?? '').trim()
  if (t.length < 2) return false
  return !/(팀|본부)$/.test(t) && !['전사', '미지정', '-'].includes(t) && !/시스템|엔진|서비스|스케줄러/.test(t)
}

/** 반출 문맥에 실릴 수 있는 사람 이름 — 로그인 계정이 있는 사용자뿐 아니라 대장의 보유자도 개인이다.
 *  보유자 대부분은 계정이 없다(현장에서는 장비를 쓰는 사람과 시스템 계정을 가진 사람이 다르다).
 *  계정 표만 넘기면 그 이름들이 마스킹되지 않은 채 외부 LLM 으로 나간다 — 문맥은 자산 한 줄마다
 *  보유자를 찍는데(buildContext 의 '${a.owner}/${a.dept}'), 마스킹 목록은 그 이름을 모르는 상태였다. */
export function egressPersonNames(users: { name: string }[], assets: { owner: string }[]): string[] {
  return [...new Set([...users.map((u) => u.name), ...assets.map((a) => a.owner)])].filter(isPersonName)
}

/** 비식별 처리 — 외부 LLM 반출 전 개인·네트워크 식별자를 마스킹한다(제품안내서 §05 "비식별 처리 후 상용 LLM API").
 *  이름은 결정적 토큰([사용자N])으로 치환(같은 이름=같은 토큰), IP 는 상위 2옥텟만 남기고, MAC·이메일은 마스킹한다.
 *  분류·집계에 필요한 자산 분류·상태·부서·모델·수치는 보존해 답변 품질을 유지한다. */
export function deidentify(text: string, personNames: string[]): string {
  let out = text
  // 이름 — 긴 이름부터 치환해 부분 겹침을 방지하고, 동일 이름은 동일 토큰으로 매핑(재현성)
  const uniq = [...new Set(personNames)].filter((n) => n && n.trim().length >= 2).sort((a, b) => b.length - a.length)
  uniq.forEach((name, i) => {
    out = out.split(name).join(`[사용자${i + 1}]`)
  })
  // IPv4 — 상위 2옥텟만 유지(네트워크 대역은 보존, 호스트 식별자는 제거)
  out = out.replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.$2.*.*')
  // MAC 주소
  out = out.replace(/\b([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '**:**:**:**:**:**')
  // 이메일
  out = out.replace(/\b[\w.+-]+@[\w.-]+\.\w{2,}\b/g, '[이메일]')
  return out
}
