import { Card, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { ROLE_LABEL } from '@/lib/types'

export const dynamic = 'force-dynamic'

/** 권한 매트릭스 — 메뉴(화면) × 기능(버튼) 단위 (제품안내서 §02 권한·접근통제 모델) */
const ACTIONS = ['조회', '저장', '삭제', '엑셀', '편입', '격리요청', '결재'] as const

type Cell = 'y' | 'n' | 'p'
const MATRIX: { menu: string; cells: Record<string, Cell[]> }[] = [
  { menu: '대시보드', cells: { USER: ['y', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'n', 'n', 'y', 'n', 'n', 'n'], SEC_MGR: ['y', 'n', 'n', 'y', 'n', 'n', 'n'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: '자산 대장', cells: { USER: ['p', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'y', 'y', 'y', 'y', 'n', 'y'], SEC_MGR: ['y', 'n', 'n', 'y', 'n', 'y', 'n'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: '수명주기', cells: { USER: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'y', 'y', 'y', 'n', 'n', 'y'], SEC_MGR: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: '재고 · 재물조사', cells: { USER: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'y', 'y', 'y', 'n', 'n', 'y'], SEC_MGR: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: '계약 · 라이선스', cells: { USER: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'y', 'y', 'y', 'n', 'n', 'y'], SEC_MGR: ['y', 'n', 'n', 'y', 'n', 'n', 'n'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: '발견 자산 · CMDB 대사', cells: { USER: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'y', 'n', 'y', 'y', 'y', 'y'], SEC_MGR: ['y', 'y', 'n', 'y', 'y', 'y', 'y'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: 'Shadow SaaS', cells: { USER: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'n', 'n', 'y', 'n', 'n', 'n'], SEC_MGR: ['y', 'y', 'n', 'y', 'n', 'y', 'y'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: 'AI 어시스턴트', cells: { USER: ['p', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'n', 'n', 'y', 'n', 'n', 'n'], SEC_MGR: ['y', 'n', 'n', 'y', 'n', 'n', 'n'], ADMIN: ['y', 'y', 'n', 'y', 'n', 'n', 'n'] } },
  { menu: '신청 · 결재', cells: { USER: ['p', 'y', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['y', 'y', 'n', 'y', 'n', 'n', 'y'], SEC_MGR: ['y', 'y', 'n', 'y', 'n', 'y', 'y'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
  { menu: '권한 · 정책', cells: { USER: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ASSET_MGR: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], SEC_MGR: ['n', 'n', 'n', 'n', 'n', 'n', 'n'], ADMIN: ['y', 'y', 'y', 'y', 'y', 'y', 'y'] } },
]

const ROLES = ['USER', 'ASSET_MGR', 'SEC_MGR', 'ADMIN'] as const

export default async function PermissionsPage() {
  await requireRole('ADMIN')
  return (
    <>
      <ScreenHeader
        kicker="환경설정 · Access Control"
        title="권한 · 정책"
        desc="메뉴기능관리 → 메뉴관리 → 메뉴권한관리 → 사용자·그룹 — 권한은 메뉴(화면) × 기능(버튼) 단위로 부여"
      />

      <div className="pipe">
        {[
          ['메뉴기능관리', '화면 기능 정의 (조회·저장·삭제·엑셀)'],
          ['메뉴관리', '카테고리·화면번호·기능 부여'],
          ['메뉴권한관리', '메뉴권한별 메뉴·기능 및 사용자 매핑'],
          ['사용자·그룹', '사용자그룹·결재선 관리'],
        ].map(([t, sub], i) => (
          <div key={t} style={{ display: 'contents' }}>
            {i > 0 && <span className="arrow">→</span>}
            <div className={`step ${i === 2 ? 'on' : ''}`}>
              <div className="k">STEP {i + 1}</div>
              <div className="t">{t}</div>
              <div className="s">{sub}</div>
            </div>
          </div>
        ))}
      </div>

      <Card kicker="Permission Matrix" title="권한그룹 × 메뉴 · 기능 매트릭스" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl mx">
            <thead>
              <tr>
                <th rowSpan={2} style={{ verticalAlign: 'bottom' }}>메뉴 (화면)</th>
                {ROLES.map((r) => <th key={r} colSpan={7} className="c" style={{ borderLeft: '1px solid var(--line-strong)' }}>{ROLE_LABEL[r]}</th>)}
              </tr>
              <tr>
                {ROLES.flatMap((r) => ACTIONS.map((a, i) => (
                  <th key={`${r}-${a}`} className="c" style={i === 0 ? { borderLeft: '1px solid var(--line-strong)' } : undefined}>{a}</th>
                )))}
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((row) => (
                <tr key={row.menu}>
                  <td className="strong">{row.menu}</td>
                  {ROLES.flatMap((r) => row.cells[r].map((c, i) => (
                    <td key={`${r}-${i}`} className={c} style={i === 0 ? { borderLeft: '1px solid var(--line-strong)' } : undefined}>
                      {c === 'y' ? '✓' : c === 'p' ? '본인' : '·'}
                    </td>
                  )))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="callout" style={{ margin: 14 }}>
          <b>화면·기능 단위 최소권한.</b> 사용자에게는 매핑된 메뉴·기능만 노출되며, AI 질의를 포함한 모든 데이터
          접근이 동일한 권한 모델을 통과합니다. &lsquo;본인&rsquo;은 본인 보유 자산 범위 내 조회를 뜻하고, 폐기·격리는
          필수 결재 대상입니다.
        </div>
      </Card>
    </>
  )
}
