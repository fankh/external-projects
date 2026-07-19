import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** DXF 내보내기 프록시 — 제작 DXF(기본) 또는 블록 다이어그램(?kind=blocks → /cad/from-blocks.dxf). */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const body = await req.text()
  const kind = req.nextUrl.searchParams.get('kind')
  const target = kind === 'blocks' ? '/cad/from-blocks.dxf' : '/cad/export-dxf'
  const res = await fetch(`${API_BASE}${target}`, {
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
