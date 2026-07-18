'use client'
/** 좌측 메뉴/트리 — 레거시 SPA components/LnavTree 포팅 (.lnav/.tree2 문법).
 *  활성 화면 마킹: 조상 폴더 자동 펼침 + 스크롤 인뷰. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface TreeNode {
  id: string
  label: string
  href?: string
  children?: TreeNode[]
  icon?: string
}

function subtreeHasId(node: TreeNode, id: string | null | undefined): boolean {
  if (!id) return false
  if (node.id === id) return true
  return (node.children ?? []).some((c) => subtreeHasId(c, id))
}

function Node(props: {
  node: TreeNode
  depth: number
  selectedId?: string | null
  onSelect?: (n: TreeNode) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { node, depth } = props
  const hasChildren = (node.children?.length ?? 0) > 0
  const lvl = depth >= 4 ? 'l4' : depth === 3 ? 'l3' : depth === 2 ? 'l2' : ''
  const isSel = props.selectedId === node.id
  const ref = useRef<HTMLDivElement>(null)

  const containsSel = hasChildren && subtreeHasId(node, props.selectedId)
  useEffect(() => {
    if (containsSel) setExpanded(true)
  }, [containsSel, props.selectedId])

  useEffect(() => {
    if (isSel) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [isSel])

  return (
    <>
      <div ref={ref} className={`tn ${lvl} ${isSel ? 'sel' : ''}`}
        onClick={() => { props.onSelect?.(node); if (hasChildren) setExpanded(!expanded) }}>
        <span className="pm">{hasChildren ? (expanded ? '−' : '+') : '·'}</span>
        <span className="ico">{node.icon ?? (hasChildren ? '📁' : '▣')}</span>
        {node.label}
      </div>
      {expanded && node.children?.map((c) => (
        <Node key={c.id} node={c} depth={depth + 1}
          selectedId={props.selectedId} onSelect={props.onSelect} />
      ))}
    </>
  )
}

export function LnavTree(props: {
  title: string
  nodes: TreeNode[]
  selectedId?: string | null
  onSelect?: (n: TreeNode) => void
  footer?: ReactNode
  width?: number
  headerAction?: ReactNode   // 우측 액션 (✎ 메뉴 편집)
  emptyHint?: string         // 빈 목록 안내
}) {
  return (
    <div className="lnav" style={props.width ? { width: props.width } : undefined}>
      <div className="hd" style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ flex: 1 }}>{props.title}</span>
        {props.headerAction}
      </div>
      <div className="tree2" style={{ flex: 1 }}>
        {props.nodes.map((n) => (
          <Node key={n.id} node={n} depth={1}
            selectedId={props.selectedId} onSelect={props.onSelect} />
        ))}
        {props.nodes.length === 0 && props.emptyHint ? (
          <div style={{ padding: '8px 10px', fontSize: 10.5, color: 'var(--txt-mute)' }}>{props.emptyHint}</div>
        ) : null}
      </div>
      {props.footer}
    </div>
  )
}
