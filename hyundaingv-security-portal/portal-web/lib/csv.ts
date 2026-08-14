/** 엑셀 다운로드 — BOM 포함 CSV (Excel 이 UTF-8 한글을 바로 연다).
 *  실서비스에서는 엑셀양식관리 기반 xlsx 생성으로 대체된다. */

function esc(v: string | number): string {
  let s = String(v)
  // CSV 수식 주입(CWE-1236) 방어 — 사용자 입력 문자열 셀이 수식 트리거 문자(= + - @ 탭 CR)로
  // 시작하면 작은따옴표로 무력화한다. 숫자 셀은 제외(음수 보존), 자리표시자 '-' 단독도 제외(무해).
  if (typeof v === 'string' && s !== '-' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  // 내부에 낀 CR(\r)도 인용한다 — 레거시 Mac 단독 CR 이 필드 중간에 남으면(업로드 trim 은 양끝만 제거)
  // 일부 파서가 이를 레코드 구분자로 봐 행이 깨진다. 따옴표·콤마·LF 와 함께 CR 도 인용 대상에 포함.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csvResponse(filename: string, rows: (string | number)[][]): Response {
  const body = '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.csv`,
    },
  })
}
