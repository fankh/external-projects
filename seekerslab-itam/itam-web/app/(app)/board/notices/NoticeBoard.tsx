'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { BoardPost } from '@/lib/types'
import { deleteNotice, postNotice, toggleNoticePin } from '../actions'

export function NoticeBoard({ posts, canWrite }: { posts: BoardPost[]; canWrite: boolean }) {
  const [openId, setOpenId] = useState<string | null>(posts[0]?.id ?? null)
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const open = posts.find((p) => p.id === openId) ?? null

  return (
    <>
      <Card kicker="Notices" title="공지 목록" pad={false}
        actions={canWrite ? <button className="btn sm pri" onClick={() => setWriting((w) => !w)}>{writing ? '취소' : '공지 등록'}</button> : undefined}>
        {writing && (
          <div className="vstack" style={{ gap: 8, padding: 14, borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
            <input className="input" placeholder="공지 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input" style={{ height: 110, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
              placeholder="공지 내용" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="hstack">
              <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                상단 고정 (필독)
              </label>
              <span className="right" />
              <button className="btn pri" disabled={pending || !title.trim() || !body.trim()}
                onClick={() => startTransition(async () => {
                  const r = await postNotice(title, body, pinned)
                  setMsg(r.message)
                  if (r.ok) { setTitle(''); setBody(''); setPinned(false); setWriting(false) }
                })}>등록</button>
            </div>
            {msg && <div className="dim" style={{ fontSize: 11.5 }}>{msg}</div>}
          </div>
        )}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th className="c" style={{ width: 70 }}>구분</th><th>제목</th><th>작성자</th><th>등록일</th><th className="num">조회</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className={`clickable ${p.id === openId ? 'sel' : ''}`}
                  onClick={() => setOpenId(p.id === openId ? null : p.id)}>
                  <td className="c">{p.pinned ? <Chip tone="err" bare>필독</Chip> : <span className="mut">공지</span>}</td>
                  <td className="strong">{p.title}</td>
                  <td>{p.author}<span className="mut"> · {p.dept}</span></td>
                  <td className="tnum">{p.createdAt}</td>
                  <td className="num tnum mute">{p.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card kicker={`${open.createdAt} · ${open.author} (${open.dept})`} title={open.title}
          actions={canWrite ? (
            <div className="hstack" style={{ gap: 6 }}>
              <button className="btn sm" disabled={pending}
                onClick={() => startTransition(async () => setMsg((await toggleNoticePin(open.id)).message))}>
                {open.pinned ? '고정 해제' : '상단 고정'}
              </button>
              <button className="btn sm danger" disabled={pending}
                onClick={() => startTransition(async () => {
                  const r = await deleteNotice(open.id)
                  setMsg(r.message)
                  if (r.ok) setOpenId(null)
                })}>삭제</button>
            </div>
          ) : undefined}>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, color: 'var(--ink-2)' }}>{open.body}</div>
          {canWrite && msg && <div className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>{msg}</div>}
        </Card>
      )}
    </>
  )
}
