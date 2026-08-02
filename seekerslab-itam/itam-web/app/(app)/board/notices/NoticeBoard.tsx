'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { BoardPost } from '@/lib/types'
import { acknowledgeNotice, deleteNotice, editNotice, postNotice, remindNoticeUnacked, toggleNoticePin } from '../actions'

export function NoticeBoard({ posts, canWrite, me, totalUsers, today }: { posts: BoardPost[]; canWrite: boolean; me: string; totalUsers: number; today: string }) {
  const [openId, setOpenId] = useState<string | null>(posts[0]?.id ?? null)
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [pubAt, setPubAt] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [et, setEt] = useState('')
  const [eb, setEb] = useState('')
  const [ep, setEp] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const open = posts.find((p) => p.id === openId) ?? null
  // 다른 공지로 넘어가면 편집 모드 해제
  const select = (id: string) => { setEditing(null); setOpenId(id === openId ? null : id) }

  return (
    <>
      <Card kicker="Notices" title="공지 목록" pad={false}
        actions={canWrite ? <button className="btn sm pri" onClick={() => setWriting((w) => !w)}>{writing ? '취소' : '공지 등록'}</button> : undefined}>
        {writing && (
          <div className="vstack" style={{ gap: 8, padding: 14, borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
            <input className="input" placeholder="공지 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className="input" style={{ height: 110, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
              placeholder="공지 내용" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="hstack" style={{ flexWrap: 'wrap', gap: 10 }}>
              <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                상단 고정 (필독)
              </label>
              <label className="hstack" style={{ gap: 6, fontSize: 12.5 }} title="미설정 시 즉시 발행. 미래 날짜 지정 시 그날 전사 공개(예약 발행)">
                예약 발행일
                <input className="input" type="date" style={{ height: 28 }} min={today} value={pubAt} onChange={(e) => setPubAt(e.target.value)} />
              </label>
              <span className="right" />
              <button className="btn pri" disabled={pending || !title.trim() || !body.trim()}
                onClick={() => startTransition(async () => {
                  const r = await postNotice(title, body, pinned, pubAt || undefined)
                  setMsg(r.message)
                  if (r.ok) { setTitle(''); setBody(''); setPinned(false); setPubAt(''); setWriting(false) }
                })}>{pubAt && pubAt > today ? '예약 등록' : '등록'}</button>
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
                  onClick={() => select(p.id)}>
                  <td className="c">{p.publishAt && p.publishAt > today ? <Chip tone="info" bare>예약</Chip> : p.pinned ? <Chip tone="err" bare>필독</Chip> : <span className="mut">공지</span>}</td>
                  <td className="strong">{p.title}{p.publishAt && p.publishAt > today && <span className="mut" style={{ fontSize: 11 }}> · {p.publishAt} 발행 예정</span>}</td>
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
        <Card kicker={`${open.createdAt} · ${open.author} (${open.dept})`} title={editing === open.id ? '공지 수정' : open.title}
          actions={canWrite && editing !== open.id ? (
            <div className="hstack" style={{ gap: 6 }}>
              <button className="btn sm" disabled={pending}
                onClick={() => { setEditing(open.id); setEt(open.title); setEb(open.body); setEp(Boolean(open.pinned)); setMsg(null) }}>수정</button>
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
          {editing === open.id ? (
            <div className="vstack" style={{ gap: 8 }}>
              <input className="input" placeholder="공지 제목" value={et} onChange={(e) => setEt(e.target.value)} />
              <textarea className="input" style={{ height: 140, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
                placeholder="공지 내용" value={eb} onChange={(e) => setEb(e.target.value)} />
              <div className="hstack">
                <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={ep} onChange={(e) => setEp(e.target.checked)} />
                  상단 고정 (필독)
                </label>
                <span className="right" />
                <button className="btn" disabled={pending} onClick={() => setEditing(null)}>취소</button>
                <button className="btn pri" disabled={pending || !et.trim() || !eb.trim()}
                  onClick={() => startTransition(async () => {
                    const r = await editNotice(open.id, et, eb, ep)
                    setMsg(r.message)
                    if (r.ok) setEditing(null)
                  })}>저장</button>
              </div>
              {msg && <div className="dim" style={{ fontSize: 11.5 }}>{msg}</div>}
            </div>
          ) : (
            <>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, color: 'var(--ink-2)' }}>{open.body}</div>
              {open.pinned && (() => {
                const acks = open.acks ?? []
                const mine = acks.find((a) => a.by === me)
                return (
                  <div className="hstack" style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--line)', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Chip tone="err" bare>필독</Chip>
                    {mine ? (
                      <span className="hstack" style={{ gap: 6, fontSize: 12.5, color: 'var(--ok)', fontWeight: 600 }}>
                        ✓ 읽음 확인함 · {mine.at}
                      </span>
                    ) : (
                      <button className="btn sm pri" disabled={pending}
                        onClick={() => startTransition(async () => setMsg((await acknowledgeNotice(open.id)).message))}>
                        읽음 확인
                      </button>
                    )}
                    <span className="right" />
                    {canWrite && acks.length < totalUsers && (
                      <button className="btn sm" disabled={pending}
                        title="아직 읽음 확인하지 않은 사용자에게 필독 확인 요청 통보"
                        onClick={() => startTransition(async () => setMsg((await remindNoticeUnacked(open.id)).message))}>
                        미확인자 {totalUsers - acks.length}명 안내 발송
                      </button>
                    )}
                    <span className="mut" style={{ fontSize: 11.5 }} title="필독 확인 커버리지">
                      필독 확인 {acks.length}/{totalUsers}명
                    </span>
                  </div>
                )
              })()}
              {msg && <div className="dim" style={{ fontSize: 11.5, marginTop: 10 }}>{msg}</div>}
            </>
          )}
        </Card>
      )}
    </>
  )
}
