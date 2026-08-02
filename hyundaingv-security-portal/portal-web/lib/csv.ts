/** 엑셀 다운로드 — BOM 포함 CSV (Excel 이 UTF-8 한글을 바로 연다).
 *  실서비스에서는 엑셀양식관리 기반 xlsx 생성으로 대체된다. */

function esc(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
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
