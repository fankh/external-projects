/** 좌측 메뉴/트리 (디자인시안 .lnav/.tree2).
 *  페이지 이동(탭 클릭·브라우저 뒤로/앞으로) 시 활성 화면을 마킹 —
 *  조상 폴더 자동 펼침 + 스크롤 인뷰. */
import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface TreeNode {
  id: string
  label: string
  level?: 1 | 2 | 3 | 4
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
  onOpen?: (n: TreeNode) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const { node, depth } = props
  const hasChildren = (node.children?.length ?? 0) > 0
  const lvl = depth >= 4 ? 'l4' : depth === 3 ? 'l3' : depth === 2 ? 'l2' : ''
  const isSel = props.selectedId === node.id
  const ref = useRef<HTMLDivElement>(null)

  // 선택 노드가 하위에 있으면 접혀 있어도 자동 펼침 (페이지 이동 마킹)
  const containsSel = hasChildren && subtreeHasId(node, props.selectedId)
  useEffect(() => {
    if (containsSel) setExpanded(true)
  }, [containsSel, props.selectedId])

  // 선택 노드를 보이는 위치로 스크롤
  useEffect(() => {
    if (isSel) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [isSel])

  return (
    <>
      <div ref={ref} className={`tn ${lvl} ${isSel ? 'sel' : ''}`}
        onClick={() => { props.onSelect?.(node); if (hasChildren) setExpanded(!expanded) }}
        onDoubleClick={() => props.onOpen?.(node)}>
        <span className="pm">{hasChildren ? (expanded ? '−' : '+') : '·'}</span>
        <span className="ico">{node.icon ?? (hasChildren ? '📁' : '▣')}</span>
        {node.label}
      </div>
      {expanded && node.children?.map((c) => (
        <Node key={c.id} node={c} depth={depth + 1}
          selectedId={props.selectedId} onSelect={props.onSelect} onOpen={props.onOpen} />
      ))}
    </>
  )
}

export function LnavTree(props: {
  title: string
  nodes: TreeNode[]
  selectedId?: string | null
  onSelect?: (n: TreeNode) => void
  onOpen?: (n: TreeNode) => void  // 더블클릭 = 화면 열기 (레거시 문법)
  footer?: ReactNode
  width?: number
}) {
  return (
    <div className="lnav" style={props.width ? { width: props.width } : undefined}>
      <div className="hd">{props.title}</div>
      <div className="tree2" style={{ flex: 1 }}>
        {props.nodes.map((n) => (
          <Node key={n.id} node={n} depth={1}
            selectedId={props.selectedId} onSelect={props.onSelect} onOpen={props.onOpen} />
        ))}
      </div>
      {props.footer}
    </div>
  )
}
