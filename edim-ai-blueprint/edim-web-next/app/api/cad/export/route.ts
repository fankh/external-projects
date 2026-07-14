import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** DXF 내보내기 프록시 — 현재 치수로 제작 DXF 를 바이너리 스트림. (JSON apiServer 로는 불가) */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const body = await req.text()
  const res = await fetch(`${API_BASE}/cad/export-dxf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body,
    cache: 'no-store',
  })
  if (!res.ok) return NextResponse.json({ detail: `HTTP ${res.status}` }, { status: res.status })
  const buf = await res.arrayBuffer()
  return new NextResponse(buf, {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'application/dxf',
      'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment; filename="part.dxf"',
    },
  })
}
