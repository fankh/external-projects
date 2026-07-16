import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** XLSX 다운로드 프록시 (N4b) — 허용 목록 기반: ?kind=group&id=KOF | ?kind=table&id=Table12.
 *  (nginx 는 /api/next/ 프리픽스를 Next 로 라우팅 — 이후 핸들러 공용 프리픽스) */
const PATHS: Record<string, (id: string) => string> = {
  group: (id) => `/codes/groups/${encodeURIComponent(id)}/export.xlsx`,
  table: (id) => `/tables/${encodeURIComponent(id)}/export.xlsx`,
}

/** 감사 로그 XLSX — 필터 파라미터 허용 목록 통과 (P2). */
const AUDIT_PARAMS = ['fromDate', 'toDate', 'user', 'action', 'target'] as const

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const kind = sp.get('kind') ?? ''
  const id = sp.get('id') ?? ''
  let path: string
  let filename = id
  if (kind === 'audit') {
    const qs = new URLSearchParams()
    for (const k of AUDIT_PARAMS) { const v = sp.get(k); if (v) qs.set(k, v) }
    qs.set('limit', '10000')
    path = `/history/export.xlsx?${qs.toString()}`
    filename = 'audit'
  } else {
    const build = PATHS[kind]
    if (!build || !id) return NextResponse.json({ detail: 'kind(group|table|audit)·id 필요' }, { status: 422 })
    path = build(id)
  }
  const token = await getToken()
  const res = await fetch(API_BASE + path, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
    },
  })
}
