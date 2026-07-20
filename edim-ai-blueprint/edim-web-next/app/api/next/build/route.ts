/** 1.1 — 현재 서버 빌드 ID. 열린 탭이 배포 스큐를 감지해 새로고침을 안내하는 데 사용. */
import { NextResponse } from 'next/server'
import { buildId } from '@/lib/buildId'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ buildId: buildId() }, { headers: { 'Cache-Control': 'no-store' } })
}
