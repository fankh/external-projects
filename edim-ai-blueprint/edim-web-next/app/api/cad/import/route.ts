import { NextRequest, NextResponse } from 'next/server'
import { getToken } from '@/lib/session'

const API_BASE = process.env.EDIM_API_BASE ?? 'https://edim.seekerslab.com/api/v1'

/** DXF/DWG 업로드 프록시 — multipart FormData 를 백엔드 /cad/import 로 전달. */
export async function POST(req: NextRequest) {
  const token = await getToken()
  const form = await req.formData()
  const res = await fetch(`${API_BASE}/cad/import`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
    cache: 'no-store',
  })
  const text = await res.text()
  return new NextResponse(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
}
