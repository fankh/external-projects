'use client'
import { useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import type { BoardPost, QnaCategory } from '@/lib/types'
import { answerQuestion, askQuestion, deleteQuestion, editQuestion } from '../actions'

const CATEGORIES: QnaCategory[] = ['자산 신청·반납', '장애·수리', '라이선스', '보안·Discovery', '기타']

export function QnaBoard({ posts, canAnswer, canModerate, me }: { posts: BoardPost[]; canAnswer: boolean; canModerate: boolean; me: string }) {
  const [openId, setOpenId] = useState<string | null>(posts.find((p) => !p.answer)?.id ?? posts[0]?.id ?? null)
  const [asking, setAsking] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<QnaCategory>(CATEGORIES[0])
  const [answer, setAnswer] = useState('')
  const [editingAnswer, setEditingAnswer] = useState(false)
  const [editingQ, setEditingQ] = useState(false)
  const [eqTitle, setEqTitle] = useState('')
  const [eqBody, setEqBody] = useState('')
  const [eqCat, setEqCat] = useState<QnaCategory>(CATEGORIES[0])
  const [msg, setMsg] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const open = posts.find((p) => p.id === openId) ?? null
  const select = (id: string) => { setEditingAnswer(false); setAnswer(''); setEditingQ(false); setOpenId(id === openId ? null : id) }
  // 본인 또는 Admin, 답변 전 문의만 수정 가능
  const canEditQ = !!open && (open.author === me || canModerate) && !open.answer
  const openEditQ = () => { if (!open) return; setEditingQ(true); setEqTitle(open.title); setEqBody(open.body); setEqCat((open.category ?? '기타') as QnaCategory); setMsg(null) }

  return (
    <>
      <Card kicker="Questions" title="문의 목록" pad={false}
        actions={<button className="btn sm pri" onClick={() => setAsking((a) => !a)}>{asking ? '취소' : '질문하기'}</button>}>
        {asking && (
          <div className="vstack" style={{ gap: 8, padding: 14, borderBottom: '1px solid var(--line)', background: 'var(--canvas)' }}>
            <div className="hstack" style={{ gap: 8 }}>
              <select className="select" value={category} onChange={(e) => setCategory(e.target.value as QnaCategory)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input className="input" style={{ flex: 1 }} placeholder="문의 제목" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <textarea className="input" style={{ height: 96, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
              placeholder="문의 내용을 입력하세요" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="hstack">
              <span className="dim" style={{ fontSize: 11.5 }}>담당자 답변 등록 시 알림을 받습니다.</span>
              <span className="right" />
              <button className="btn pri" disabled={pending || !title.trim() || !body.trim()}
                onClick={() => startTransition(async () => {
                  const r = await askQuestion(title, body, category)
                  setMsg(r.message)
                  if (r.ok) { setTitle(''); setBody(''); setAsking(false) }
                })}>등록</button>
            </div>
          </div>
        )}
        {msg && <div className="callout" style={{ margin: 14 }}>{msg}</div>}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>분류</th><th>제목</th><th>작성자</th><th>등록일</th><th className="num">조회</th><th className="c">상태</th></tr></thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id} className={`clickable ${p.id === openId ? 'sel' : ''}`}
                  onClick={() => select(p.id)}>
                  <td className="mute">{p.category ?? '기타'}</td>
                  <td className="strong">{p.title}</td>
                  <td>{p.author}{p.author === me && <span className="mut"> (나)</span>}</td>
                  <td className="tnum">{p.createdAt}</td>
                  <td className="num tnum mute">{p.views}</td>
                  <td className="c">{p.answer ? <Chip tone="ok">답변 완료</Chip> : <Chip tone="warn">답변 대기</Chip>}</td>
                </tr>
              ))}
              {posts.length === 0 && <tr><td colSpan={6}><div className="empty">등록된 문의가 없습니다</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card kicker={`${open.category ?? '기타'} · ${open.createdAt} · ${open.author} (${open.dept})`} title={editingQ ? '문의 수정' : open.title}
          actions={(open.author === me || canModerate) && !editingQ ? (
            <div className="hstack" style={{ gap: 6 }}>
              {canEditQ && <button className="btn sm" disabled={pending} onClick={openEditQ}>문의 수정</button>}
              <button className="btn sm danger" disabled={pending}
                onClick={() => startTransition(async () => {
                  const r = await deleteQuestion(open.id)
                  setMsg(r.message)
                  if (r.ok) setOpenId(null)
                })}>삭제</button>
            </div>
          ) : undefined}>
          {editingQ ? (
            <div className="vstack" style={{ gap: 8 }}>
              <div className="hstack" style={{ gap: 8 }}>
                <select className="select" value={eqCat} onChange={(e) => setEqCat(e.target.value as QnaCategory)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input className="input" style={{ flex: 1 }} placeholder="문의 제목" value={eqTitle} onChange={(e) => setEqTitle(e.target.value)} />
              </div>
              <textarea className="input" style={{ height: 110, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
                placeholder="문의 내용" value={eqBody} onChange={(e) => setEqBody(e.target.value)} />
              <div className="hstack">
                <span className="right" />
                <button className="btn" disabled={pending} onClick={() => setEditingQ(false)}>취소</button>
                <button className="btn pri" disabled={pending || !eqTitle.trim() || !eqBody.trim()}
                  onClick={() => startTransition(async () => {
                    const r = await editQuestion(open.id, eqTitle, eqBody, eqCat)
                    setMsg(r.message)
                    if (r.ok) setEditingQ(false)
                  })}>저장</button>
              </div>
              {msg && <div className="dim" style={{ fontSize: 11.5 }}>{msg}</div>}
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, color: 'var(--ink-2)' }}>{open.body}</div>
          )}

          {open.answer ? (
            <div style={{ marginTop: 16, padding: '12px 14px', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', borderRadius: 8 }}>
              <div className="hstack" style={{ justifyContent: 'space-between', gap: 8 }}>
                <div className="kicker">답변 · {open.answer.by} · {open.answer.at}</div>
                {canAnswer && !editingAnswer && (
                  <button className="btn sm ghost" disabled={pending}
                    onClick={() => { setEditingAnswer(true); setAnswer(open.answer?.body ?? ''); setMsg(null) }}>답변 수정</button>
                )}
              </div>
              {editingAnswer ? (
                <div className="vstack" style={{ gap: 8, marginTop: 8 }}>
                  <textarea className="input" style={{ height: 96, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
                    value={answer} onChange={(e) => setAnswer(e.target.value)} />
                  <div className="hstack">
                    <span className="right" />
                    <button className="btn" disabled={pending} onClick={() => { setEditingAnswer(false); setAnswer('') }}>취소</button>
                    <button className="btn pri" disabled={pending || !answer.trim()}
                      onClick={() => startTransition(async () => {
                        const r = await answerQuestion(open.id, answer)
                        setMsg(r.message)
                        if (r.ok) { setEditingAnswer(false); setAnswer('') }
                      })}>저장</button>
                  </div>
                </div>
              ) : (
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8, marginTop: 6 }}>{open.answer.body}</div>
              )}
            </div>
          ) : canAnswer ? (
            <div className="vstack" style={{ gap: 8, marginTop: 16 }}>
              <div className="kicker mute">답변 등록</div>
              <textarea className="input" style={{ height: 96, padding: '8px 10px', resize: 'vertical', lineHeight: 1.6 }}
                placeholder="답변 내용을 입력하세요" value={answer} onChange={(e) => setAnswer(e.target.value)} />
              <div className="hstack">
                <span className="right" />
                <button className="btn pri" disabled={pending || !answer.trim()}
                  onClick={() => startTransition(async () => {
                    const r = await answerQuestion(open.id, answer)
                    setMsg(r.message)
                    if (r.ok) setAnswer('')
                  })}>답변 등록</button>
              </div>
            </div>
          ) : (
            <div className="callout warn" style={{ marginTop: 16 }}>담당자 답변 대기 중입니다.</div>
          )}
        </Card>
      )}
    </>
  )
}
