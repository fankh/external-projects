/** OS EOL(지원 종료) 판정 — 지원이 끝난 OS 는 보안 패치가 없어 미패치 취약점에 상시 노출된다.
 *  (제품안내서 §05 취약점 우선순위: "EOL OS·미패치 SW") 순수 함수 — 서버·클라이언트 공용(스토어 비의존). */

export const OS_EOL: { match: RegExp; label: string; eol: string }[] = [
  { match: /windows\s*7/i, label: 'Windows 7', eol: '2020-01-14' },
  { match: /windows\s*server\s*2012/i, label: 'Windows Server 2012', eol: '2023-10-10' },
  { match: /centos\s*7/i, label: 'CentOS 7', eol: '2024-06-30' },
  { match: /ubuntu\s*18\.04/i, label: 'Ubuntu 18.04', eol: '2023-05-31' },
  { match: /windows\s*10/i, label: 'Windows 10', eol: '2025-10-14' },
]

/** 지원 종료가 이미 경과한 OS 면 {label, eol} 반환, 아니면 null. today 는 'YYYY-MM-DD'. */
export function eolOsOf(os: string | undefined, today: string): { label: string; eol: string } | null {
  if (!os) return null
  const hit = OS_EOL.find((x) => x.match.test(os))
  if (!hit || hit.eol > today) return null
  return { label: hit.label, eol: hit.eol }
}
