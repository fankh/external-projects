/** 좌측 메뉴/트리 (디자인시안 .lnav/.tree2). */
import { useState, type ReactNode } from 'react'

export interface TreeNode {
  id: string
  label: string
  level?: 1 | 2 | 3 | 4
  children?: TreeNode[]
  icon?: string
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
  return (
    <>
      <div className={`tn ${lvl} ${props.selectedId === node.id ? 'sel' : ''}`}
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
