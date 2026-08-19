'use client'
import { useMemo, useState, useTransition } from 'react'
import { Card, Chip } from '@/components/ui'
import { noticeAudienceLabel, noticeTargets } from '@/lib/notice'
import { NOTICE_CATEGORIES, type BoardPost, type NoticeCategory } from '@/lib/types'
import { acknowledgeNotice, deleteNotice, editNotice, postNotice, recordPostView, remindNoticeUnacked, toggleNoticePin } from '../actions'

export function NoticeBoard({ posts, canWrite, me, allUsers, depts, today, initialSel }: { posts: BoardPost[]; canWrite: boolean; me: string; allUsers: { name: string; dept: string }[]; depts: string[]; today: string; initialSel?: string }) {
  // 딥링크(?sel=NTC-…) — 알림 로그·대시보드에서 특정 공지로 진입. 목록에 없으면(비공개·예약) 최신 공지로 폴백.
  const [openId, setOpenId] = useState<string | null>(
    (initialSel && posts.some((p) => p.id === initialSel) ? initialSel : posts[0]?.id) ?? null,
  )
  const [writing, setWriting] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
  const [cat, setCat] = useState<NoticeCategory>('일반')
  const [aud, setAud] = useState('전사')
  const [pubAt, setPubAt] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [et, setEt] = useState('')
  const [eb, setEb] = useState('')
  const [ep, setEp] = useState(false)
  const [ec, setEc] = useState<NoticeCategory>('일반')
  const [eaud, setEaud] = useState('전사')
  const [msg, setMsg] = useState<string | null>(null)
  // 목록 필터 — 검색·필독만·예약만 (QnA·감사 로그와 동일 패턴). 공지가 쌓이면 필수.
  const [fq, setFq] = useState('')
  const [fpinned, setFpinned] = useState(false)
  const [fscheduled, setFscheduled] = useState(false)
  const [fcat, setFcat] = useState('전체')
  const [pending, startTransition] = useTransition()
  const open = posts.find((p) => p.id === openId) ?? null
  const rows = useMemo(() => {
    const needle = fq.trim().toLowerCase()
    return posts.filter((p) => {
      if (fpinned && !p.pinned) return false
      if (fscheduled && !(p.publishAt && p.publishAt > today)) return false
      if (fcat !== '전체' && (p.category ?? '일반') !== fcat) return false
      if (needle && ![p.title, p.body, p.author].some((f) => f?.toLowerCase().includes(needle))) return false
      return true
    })
  }, [posts, fq, fpinned, fscheduled, fcat, today])
  // 다른 공지로 넘어가면 편집 모드 해제. 새 공지를 여는 경우 조회수를 올린다(닫기·같은 글 토글은 제외).
  const select = (id: string) => {
    setEditing(null)
    const opening = id !== openId
    setOpenId(opening ? id : null)
    if (opening) startTransition(async () => { await recordPostView(id) })
  }

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
              <select className="select" value={cat} onChange={(e) => setCat(e.target.value as NoticeCategory)} title="공지 분류">
                {NOTICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="select" value={aud} onChange={(e) => setAud(e.target.value)} title="공지 대상 — 전사 또는 특정 부서(필독 확인율·독촉 분모가 대상으로 좁혀집니다)">
                <option value="전사">대상 — 전사</option>
                {depts.map((d) => <option key={d} value={d}>대상 — {d}</option>)}
              </select>
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
                  const r = await postNotice(title, body, pinned, pubAt || undefined, cat, aud)
                  setMsg(r.message)
                  if (r.ok) { setTitle(''); setBody(''); setPinned(false); setPubAt(''); setCat('일반'); setAud('전사'); setWriting(false) }
                })}>{pubAt && pubAt > today ? '예약 등록' : '등록'}</button>
            </div>
            {msg && <div className="dim" style={{ fontSize: 11.5 }}>{msg}</div>}
          </div>
        )}
        <div className="qbar" style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap', gap: 8 }}>
          <input className="input" style={{ width: 200 }} placeholder="제목·내용·작성자 검색" value={fq} onChange={(e) => setFq(e.target.value)} />
          <select className="select" style={{ maxWidth: 150 }} value={fcat} onChange={(e) => setFcat(e.target.value)}>
            <option value="전체">분류 — 전체</option>
            {NOTICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
            <input type="checkbox" checked={fpinned} onChange={(e) => setFpinned(e.target.checked)} /> 필독만
          </label>
          {canWrite && (
            <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }} title="발행일이 미래인 예약 공지만">
              <input type="checkbox" checked={fscheduled} onChange={(e) => setFscheduled(e.target.checked)} /> 예약만
            </label>
          )}
          <span className="cnt">{rows.length}건 / 전체 {posts.length}건</span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th className="c" style={{ width: 70 }}>구분</th><th className="c">분류</th><th>제목</th><th>작성자</th><th>등록일</th><th className="num">조회</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className={`clickable ${p.id === openId ? 'sel' : ''}`}
                  onClick={() => select(p.id)}>
                  <td className="c">{p.publishAt && p.publishAt > today ? <Chip tone="info" bare>예약</Chip> : p.pinned ? <Chip tone="err" bare>필독</Chip> : <span className="mut">공지</span>}</td>
                  <td className="c"><span className="mut" style={{ fontSize: 11 }}>{p.category ?? '일반'}</span></td>
                  <td className="strong">{p.title}{p.publishAt && p.publishAt > today && <span className="mut" style={{ fontSize: 11 }}> · {p.publishAt} 발행 예정</span>}</td>
                  <td>{p.author}<span className="mut"> · {p.dept}</span></td>
                  <td className="tnum">{p.createdAt}</td>
                  <td className="num tnum mute">{p.views}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6}><div className="empty">{posts.length === 0 ? '등록된 공지가 없습니다' : '조건에 맞는 공지가 없습니다'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <Card kicker={`${open.category ?? '일반'} · ${open.createdAt} · ${open.author} (${open.dept})`} title={editing === open.id ? '공지 수정' : open.title}
          actions={canWrite && editing !== open.id ? (
            <div className="hstack" style={{ gap: 6 }}>
              <button className="btn sm" disabled={pending}
                onClick={() => { setEditing(open.id); setEt(open.title); setEb(open.body); setEp(Boolean(open.pinned)); setEc(NOTICE_CATEGORIES.includes(open.category as NoticeCategory) ? (open.category as NoticeCategory) : '일반'); setEaud(open.audienceDept ?? '전사'); setMsg(null) }}>수정</button>
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
                <select className="select" value={ec} onChange={(e) => setEc(e.target.value as NoticeCategory)} title="공지 분류">
                  {NOTICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="select" value={eaud} onChange={(e) => setEaud(e.target.value)} title="공지 대상 — 전사 또는 특정 부서(필독 확인율·독촉 분모가 대상으로 좁혀집니다)">
                  <option value="전사">대상 — 전사</option>
                  {depts.map((d) => <option key={d} value={d}>대상 — {d}</option>)}
                </select>
                <label className="hstack" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={ep} onChange={(e) => setEp(e.target.checked)} />
                  상단 고정 (필독)
                </label>
                <span className="right" />
                <button className="btn" disabled={pending} onClick={() => setEditing(null)}>취소</button>
                <button className="btn pri" disabled={pending || !et.trim() || !eb.trim()}
                  onClick={() => startTransition(async () => {
                    const r = await editNotice(open.id, et, eb, ep, ec, eaud)
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
                const targets = noticeTargets(open, allUsers)
                const totalUsers = targets.length
                const ackedBy = new Set((open.acks ?? []).map((a) => a.by))
                const acks = (open.acks ?? []).filter((a) => targets.some((t) => t.name === a.by))
                const mine = (open.acks ?? []).find((a) => a.by === me)
                // 발행 예정(publishAt 미래) 공지는 아직 대상자에게 공개 전 — 확인 집계·미확인자 독촉을 노출하지 않는다(서버 독촉 가드와 동일).
                const published = !open.publishAt || open.publishAt <= today
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
                    {canWrite && published && acks.length < totalUsers && (
                      <button className="btn sm" disabled={pending}
                        title="아직 읽음 확인하지 않은 사용자에게 필독 확인 요청 통보"
                        onClick={() => startTransition(async () => setMsg((await remindNoticeUnacked(open.id)).message))}>
                        미확인자 {totalUsers - acks.length}명 안내 발송
                      </button>
                    )}
                    <span className="mut" style={{ fontSize: 11.5 }} title="필독 확인 커버리지 (대상 집단 기준)">
                      {published
                        ? <>필독 확인 {acks.length}/{totalUsers}명 <span className="dim">· 대상 {noticeAudienceLabel(open)}</span></>
                        : <>발행 예정 · {open.publishAt} 발행 후 확인 집계 <span className="dim">· 대상 {noticeAudienceLabel(open)}</span></>}
                    </span>
                    {/* 미확인자 명단 — Admin 이 개별 후속(대면 독려·확인)을 할 수 있게 실제 이름을 노출한다. 대상 집단(전사/부서)으로 좁혀 표기. 발행 전엔 숨김. */}
                    {canWrite && published && (() => {
                      const unacked = targets.filter((u) => !ackedBy.has(u.name))
                      return unacked.length > 0 ? (
                        <div style={{ flexBasis: '100%', marginTop: 4 }}>
                          <span className="mut" style={{ fontSize: 11.5 }}>미확인자 {unacked.length}명: </span>
                          <span className="hstack" style={{ gap: 4, flexWrap: 'wrap', display: 'inline-flex' }}>
                            {unacked.map((u) => <Chip key={u.name} tone="warn" bare>{u.name}</Chip>)}
                          </span>
                        </div>
                      ) : (
                        <div style={{ flexBasis: '100%', marginTop: 4 }}>
                          <span className="mut" style={{ fontSize: 11.5, color: 'var(--ok)' }}>전원 확인 완료</span>
                        </div>
                      )
                    })()}
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
