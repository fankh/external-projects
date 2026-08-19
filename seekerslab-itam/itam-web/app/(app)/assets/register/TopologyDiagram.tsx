import type { AssetDeps } from '@/lib/cmdb-graph'

/** 의존 토폴로지 다이어그램(React·SVG) — 상위 의존(위) → 이 자산(가운데·강조) → 직접 하위(아래).
 *  자산 카드(인쇄용 문자열 SVG)의 인라인 대장판. 저하 상위는 붉은색(장애 시 이 자산 위험). 순수 표현 컴포넌트. */
export function TopologyDiagram({ deps, selNo, modelOf }: { deps: AssetDeps; selNo: string; modelOf: (no: string) => string }) {
  const up = deps.upstream
  const down = deps.dependents
  if (!up.length && !down.length) return null
  const NW = 126, NH = 32, GX = 14
  const rowW = (n: number) => (n > 0 ? n * NW + (n - 1) * GX : NW)
  const W = Math.max(rowW(up.length), NW, rowW(down.length)) + 16
  const upY = 24, midY = up.length ? 104 : 24, downY = midY + 80
  const H = (down.length ? downY : midY) + 24
  const rowX = (i: number, n: number) => (W - rowW(n)) / 2 + i * (NW + GX) + NW / 2
  const midX = W / 2
  const Box = ({ cx, cy, no, tone }: { cx: number; cy: number; no: string; tone: 'up' | 'self' | 'deg' | 'down' }) => {
    const fill = tone === 'self' ? 'var(--accent)' : tone === 'deg' ? 'var(--err)' : 'var(--panel)'
    const fg = tone === 'self' || tone === 'deg' ? '#fff' : 'currentColor'
    return (
      <g>
        <rect x={cx - NW / 2} y={cy - NH / 2} width={NW} height={NH} rx={6} fill={fill} stroke="var(--line)" />
        <text x={cx} y={cy - 1} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={fg}>{no}</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={8} fill={fg} opacity={0.75}>{modelOf(no).slice(0, 18)}</text>
      </g>
    )
  }
  return (
    <svg viewBox={`0 0 ${Math.round(W)} ${H}`} width="100%" style={{ maxWidth: Math.round(W) }}>
      <defs>
        <marker id="ahi" markerWidth={8} markerHeight={8} refX={7} refY={3} orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="var(--dim)" /></marker>
      </defs>
      {up.map((_, i) => <line key={`u${i}`} x1={rowX(i, up.length)} y1={upY + NH / 2} x2={midX} y2={midY - NH / 2} stroke="var(--dim)" strokeWidth={1.4} markerEnd="url(#ahi)" />)}
      {down.map((_, i) => <line key={`d${i}`} x1={midX} y1={midY + NH / 2} x2={rowX(i, down.length)} y2={downY - NH / 2} stroke="var(--dim)" strokeWidth={1.4} markerEnd="url(#ahi)" />)}
      {up.map((no, i) => <Box key={`bu${no}`} cx={rowX(i, up.length)} cy={upY} no={no} tone={deps.degradedUpstream.includes(no) ? 'deg' : 'up'} />)}
      <Box cx={midX} cy={midY} no={selNo} tone="self" />
      {down.map((no, i) => <Box key={`bd${no}`} cx={rowX(i, down.length)} cy={downY} no={no} tone="down" />)}
    </svg>
  )
}
