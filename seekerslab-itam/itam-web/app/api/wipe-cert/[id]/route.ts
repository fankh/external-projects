import { getSession } from '@/lib/session'
import { can } from '@/lib/perm'
import { getStore } from '@/lib/store'

/** 데이터 소거 확인서 다운로드 — 폐기 완료 건의 증적 문서(Markdown).
 *  컴플라이언스/감사 대응용. 폐기는 자산담당·Admin 업무이므로 그 외 권한그룹은 차단한다. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  // 인증 안 됨(401)과 권한 없음(403)을 가른다 — 형제 문서 API 여섯(자산 카드·검수 확인서·인수인계서·분실 신고서·
  //  퇴사 정리표·라이선스 카드)은 이미 나누는데 이 셋만 미로그인을 403 으로 뭉뚱그려, 호출자가 '로그인하라'와
  //  '너는 안 된다'를 구분할 수 없었다.
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!['ASSET_MGR', 'ADMIN'].includes(session.role)) {
    return new Response('Forbidden', { status: 403 })
  }
  // 매트릭스 '조회'도 만족해야 한다 — 화면(requireView)은 매트릭스를 보는데 문서 API 가 역할만 보면,
  //  조회 권한을 회수한 뒤에도 인쇄 문서로 같은 데이터가 그대로 나간다(화면은 막혔는데 API 는 열린 상태).
  if (!can('수명주기', '조회', session.role)) return new Response('Forbidden', { status: 403 })

  const { id } = await params
  const d = getStore().disposals.find((x) => x.id === id)
  if (!d) return new Response('Not Found', { status: 404 })
  if (d.status !== '완료') {
    // 소거가 끝나야 증적이 존재한다 — 미완 건은 확인서를 발급하지 않는다
    return new Response('소거 완료 건만 확인서를 발급할 수 있습니다.', { status: 409 })
  }

  const body = [
    '# 데이터 소거 확인서 (Data Sanitization Certificate)',
    '',
    `- 확인서 번호: **${d.certNo}**`,
    '- 발급: SEEKERSLAB ITAM — AI 자산관리 플랫폼',
    `- 발급 일시: ${d.wipedAt}`,
    '',
    '## 대상 자산',
    `- 자산번호: ${d.assetNo}`,
    `- 모델: ${d.model}`,
    `- 폐기 사유: ${d.reason}`,
    d.approvalId ? `- 폐기 결재: ${d.approvalId}` : '',
    '',
    '## 소거 처리',
    `- 소거 방식: **${d.wipeMethod}**`,
    `- 소거 일시: ${d.wipedAt}`,
    `- 처리자: ${d.wipedBy}`,
    d.disposition ? `- 물리 처분: **${d.disposition}**${d.proceeds ? ` (매각 대금 ${d.proceeds.toLocaleString()}원)` : ''}` : '',
    '',
    '## 확인',
    `본 자산의 저장 매체에 대한 데이터 소거를 위 방식으로 완료하였으며, 복구가 불가능함을 확인합니다.`,
    d.evidence ? `증적: ${d.evidence}` : '',
    '',
    '## 증적 사진',
    ...(d.photos && d.photos.length > 0
      ? d.photos.map((p) => `- [${p.label}] ${p.note ?? ''} (${p.addedBy} · ${p.addedAt})`)
      : ['- 등록된 증적 사진 없음']),
    '',
    '_본 확인서는 SEEKERSLAB ITAM 폐기 절차에서 자동 생성되었습니다._',
    '',
  ].filter((l) => l !== '').join('\n')

  const filename = `${d.certNo ?? d.id}_소거확인서.md`
  return new Response(body, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      'cache-control': 'no-store',
    },
  })
}
