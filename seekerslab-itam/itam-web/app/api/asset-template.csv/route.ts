import { getSession } from '@/lib/session'

/** 자산 일괄 등록 CSV 템플릿 — 헤더와 예시 행이 담긴 즉시 작성 가능한 CSV 를 내려준다.
 *  일괄 등록 형식을 추측하지 않도록. 자산 운영 업무이므로 사용자(USER)는 제외한다. */
export async function GET() {
  const session = await getSession()
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (session.role === 'USER') return new Response('Forbidden', { status: 403 })

  // 유형·모델 필수, 시리얼 비우면 자동 채번. 유형: 단말·서버·네트워크·주변기기·SW·가상자원
  const lines = [
    '유형,모델,시리얼,소유자,부서,위치',
    '단말,ThinkPad T14 Gen4,SN-EXAMPLE-001,홍길동,플랫폼개발팀,본사 8F',
    '서버,PowerEdge R760,,인프라운영팀,인프라운영팀,IDC-A Rack 20',
    '주변기기,Epson EB-2250U,,,총무팀,본사 2F 대회의실',
  ]
  // BOM 을 붙여 Excel 이 UTF-8 한글을 깨지 않게 연다
  const body = '﻿' + lines.join('\r\n') + '\r\n'
  return new Response(body, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent('자산일괄등록_템플릿.csv')}`,
      'cache-control': 'no-store',
    },
  })
}
