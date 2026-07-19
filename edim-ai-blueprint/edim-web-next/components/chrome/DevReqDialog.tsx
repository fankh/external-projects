'use client'

/** 개발서버 전용 — 운영자 요구사항 접수 모달 (dev_requirement, 레거시 Shell 이식).
 *  스크린샷 첨부: 파일 선택 또는 Ctrl+V 붙여넣기 (MinIO dev-req/). 이미지는 등록 시 순차 업로드. */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Chip } from '@/components/controls'
import { useI18n } from '@/components/I18nProvider'
import { devReqCreate, devReqImages, devReqList, devReqSetStatus, devReqUploadImage, type DevRequirement } from './devreqActions'

const CATEGORIES = [['CHANGE', '수정 요청'], ['BUG', '버그'], ['FEATURE', '기능 요청']] as const
const PRIORITIES = ['P1', 'P2', 'P3'] as const
const STATUS_TONE: Record<string, 'info' | 'warn' | 'ok' | 'err'> = {
  OPEN: 'warn', IN_PROGRESS: 'info', DONE: 'ok', REJECTED: 'err',
}
const STATUS_LABEL: Record<string, string> = {
  OPEN: '접수', IN_PROGRESS: '처리중', DONE: '완료', REJECTED: '반려',
}

function ReqImages({ reqId }: { reqId: number }) {
  const [imgs, setImgs] = useState<{ imageId: number; fileName: string }[] | null>(null)
  useEffect(() => { void devReqImages(reqId).then(setImgs) }, [reqId])
  if (imgs === null) return <span style={{ fontSize: 10, color: 'var(--txt-mute)' }}>이미지 로드 중…</span>
  if (!imgs.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
      {imgs.map((u) => (
        <a key={u.imageId} href={`/api/next/bin?kind=devreqimg&id=${u.imageId}`} target="_blank" rel="noreferrer" title={u.fileName}>
          <img src={`/api/next/bin?kind=devreqimg&id=${u.imageId}`} alt={u.fileName}
            style={{ maxHeight: 90, maxWidth: 160, border: '1px solid var(--line)', display: 'block' }} />
        </a>
      ))}
    </div>
  )
}

export function DevReqDialog(props: {
  screenId: string          // 현재 활성 화면 (컨텍스트 자동 첨부)
  canManage: boolean        // SETUP+ — 상태 변경 가능
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const { t } = useI18n()
  const [tab, setTab] = useState<'new' | 'list'>('new')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('CHANGE')
  const [priority, setPriority] = useState('P2')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<DevRequirement[] | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [files, setFiles] = useState<{ file: File; url: string }[]>([])
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const addFiles = useCallback((list: FileList | File[]) => {
    const imgs = Array.from(list).filter((f) => f.type.startsWith('image/'))
    if (!imgs.length) return
    setFiles((cur) => [...cur, ...imgs.map((f) => ({ file: f, url: URL.createObjectURL(f) }))])
  }, [])
  const removeFile = (idx: number) => setFiles((cur) => {
    URL.revokeObjectURL(cur[idx].url)
    return cur.filter((_, i) => i !== idx)
  })

  const reload = useCallback(() => {
    void devReqList().then((r) => {
      if (Array.isArray(r)) setRows(r)
      else { setRows([]); setMsg(r.error) }
    })
  }, [])
  useEffect(() => { if (tab === 'list') reload() }, [tab, reload])

  const submit = () => {
    if (!title.trim()) { setMsg(t('devreq.titleRequired', '제목을 입력하십시오')); return }
    setBusy(true)
    setMsg(null)
    void (async () => {
      const r = await devReqCreate({ title, content, category, priority, screenId: props.screenId })
      if (!r.reqId) { setMsg(r.error ?? '등록 실패'); setBusy(false); return }
      let uploaded = 0
      for (const f of files) {
        const fd = new FormData()
        fd.append('uploadedFile', f.file)
        const u = await devReqUploadImage(r.reqId, fd)
        if (u.ok) uploaded += 1
      }
      props.onSaved(`요구사항 등록 ✓ #${r.reqId}${uploaded ? ` (📎 이미지 ${uploaded})` : ''} — 처리 라운드에서 반영 예정 (dev_requirement)`)
    })()
  }

  return (
    <div data-devreq-dialog style={{
      position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(20,26,40,.35)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={props.onClose}>
      <div style={{ background: '#fff', border: '1px solid var(--line-strong)', width: 560, maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 30px rgba(20,26,40,.35)' }}
        onClick={(e) => e.stopPropagation()}
        onPaste={(e) => {
          if (tab !== 'new') return
          if (e.clipboardData.files.length) {
            e.preventDefault()
            addFiles(e.clipboardData.files)
          }
        }}>
        <div className="titlebar" style={{ padding: '5px 10px', fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <b>{t('devreq.title', '요구사항 접수 — 개발서버 전용')}</b>
          <Chip tone="warn">DEV</Chip>
          <span style={{ flex: 1 }} />
          <span style={{ cursor: 'pointer' }} onClick={props.onClose}>✕</span>
        </div>
        <div className="mdi" style={{ flex: 'none' }}>
          <span className={`t ${tab === 'new' ? 'on' : ''}`} onClick={() => setTab('new')}>{t('devreq.tabNew', '등록')}</span>
          <span className={`t ${tab === 'list' ? 'on' : ''}`} onClick={() => setTab('list')}>
            {t('devreq.tabList', '목록')}{rows ? ` (${rows.length})` : ''}
          </span>
        </div>
        {tab === 'new' ? (
          <>
            <div className="frm c2" style={{ padding: 10, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 6, alignItems: 'start' }}>
              <label>{t('devreq.fldTitle', '제목')} *</label>
              <input className="in req" value={title} aria-label="요구 제목" autoFocus
                placeholder={t('devreq.titlePh', '예: 단가 등록 다이얼로그에 통화 선택 추가')} maxLength={200}
                onChange={(e) => setTitle(e.target.value)} />
              <label>{t('devreq.fldCategory', '분류')}</label>
              <select className="in" value={category} aria-label="요구 분류" onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <label>{t('devreq.fldPriority', '우선순위')}</label>
              <select className="in" value={priority} aria-label="요구 우선순위" onChange={(e) => setPriority(e.target.value)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}{p === 'P1' ? ' (긴급)' : p === 'P3' ? ' (낮음)' : ''}</option>)}
              </select>
              <label>{t('devreq.fldContent', '상세 내용')}</label>
              <textarea className="in" rows={5} value={content} aria-label="요구 내용"
                placeholder={t('devreq.contentPh', '무엇을 어떻게 바꿔야 하는지 구체적으로 — 재현 절차·기대 동작 포함')}
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                onChange={(e) => setContent(e.target.value)} />
              <label>{t('devreq.fldShot', '스크린샷')}</label>
              <div>
                <input ref={fileInput} type="file" accept="image/*" multiple aria-label="이미지 첨부"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files)
                    e.target.value = ''
                  }} />
                <button className="b" type="button" onClick={() => fileInput.current?.click()}>📎 {t('devreq.pickImage', '이미지 선택')}</button>
                <span style={{ fontSize: 10, color: 'var(--txt-mute)', marginLeft: 6 }}>
                  {t('devreq.pasteHint', '또는 캡처 후 Ctrl+V 붙여넣기 (png/jpg/gif/webp · 10MB)')}
                </span>
                {files.length ? (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                    {files.map((f, i) => (
                      <span key={f.url} style={{ position: 'relative', display: 'inline-block' }}>
                        <img src={f.url} alt={f.file.name} title={f.file.name}
                          style={{ maxHeight: 64, maxWidth: 110, border: '1px solid var(--line)', display: 'block' }} />
                        <span onClick={() => removeFile(i)} title={t('devreq.remove', '제거')}
                          style={{
                            position: 'absolute', top: -6, right: -6, cursor: 'pointer',
                            background: '#fff', border: '1px solid var(--line-strong)', borderRadius: '50%',
                            width: 14, height: 14, lineHeight: '12px', textAlign: 'center', fontSize: 9,
                          }}>✕</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
            <div style={{ padding: '0 10px 6px', fontSize: 10, color: 'var(--txt-mute)' }}>
              {t('devreq.ctxNote', '현재 화면')} <b>{props.screenId || '-'}</b>{t('devreq.ctxNote2', ' 이 컨텍스트로 함께 저장됩니다. 접수된 요구는 개발 처리 라운드에서 일괄 반영 후 완료 처리됩니다.')}
            </div>
            {msg ? <div style={{ padding: '0 10px 6px', fontSize: 11, color: 'var(--err)' }}>{msg}</div> : null}
            <div style={{ display: 'flex', gap: 4, padding: '0 10px 10px', justifyContent: 'flex-end' }}>
              <button className="b" onClick={props.onClose}>{t('common.cancel', '취소')}</button>
              <button className="b pri" disabled={busy} onClick={submit}>
                {busy ? t('devreq.saving', '등록 중…') : files.length ? `${t('common.register', '등록')} (📎 ${files.length})` : t('common.register', '등록')}
              </button>
            </div>
          </>
        ) : (
          <div style={{ overflow: 'auto', flex: 1 }}>
            {msg ? <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--err)' }}>{msg}</div> : null}
            {rows === null ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('devreq.loading', '불러오는 중…')}</div>
            ) : rows.length === 0 ? (
              <div style={{ padding: 12, fontSize: 11, color: 'var(--txt-mute)' }}>{t('devreq.empty', '접수된 요구사항이 없습니다.')}</div>
            ) : (
              <table className="g" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>#</th><th>{t('devreq.colTitle', '제목')}</th><th style={{ width: 62 }}>{t('devreq.colCat', '분류')}</th>
                    <th style={{ width: 34 }}>{t('devreq.colPri', '우선')}</th><th style={{ width: 58 }}>{t('devreq.colStatus', '상태')}</th>
                    <th style={{ width: 72 }}>{t('devreq.colReq', '요청자')}</th>
                    {props.canManage ? <th style={{ width: 80 }}>{t('devreq.colManage', '처리')}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <Fragment key={r.reqId}>
                      <tr style={{ cursor: 'pointer' }}
                        onClick={() => setExpanded((cur) => (cur === r.reqId ? null : r.reqId))}>
                        <td>{r.reqId}</td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title}{r.imageCount ? <span style={{ color: 'var(--txt-mute)' }}> 📎{r.imageCount}</span> : null}
                        </td>
                        <td>{CATEGORIES.find(([v]) => v === r.category)?.[1] ?? r.category}</td>
                        <td>{r.priority}</td>
                        <td><Chip tone={STATUS_TONE[r.status] ?? 'info'}>{STATUS_LABEL[r.status] ?? r.status}</Chip></td>
                        <td>{r.requester}</td>
                        {props.canManage ? (
                          <td onClick={(e) => e.stopPropagation()}>
                            <select className="in" value={r.status} aria-label={`상태 변경 #${r.reqId}`}
                              style={{ fontSize: 10, padding: '1px 2px' }}
                              onChange={(e) => { void devReqSetStatus(r.reqId, e.target.value).then((res) => { if (res.error) setMsg(res.error); else reload() }) }}>
                              {(['OPEN', 'IN_PROGRESS', 'DONE', 'REJECTED'] as const).map((s) => (
                                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                              ))}
                            </select>
                          </td>
                        ) : null}
                      </tr>
                      {expanded === r.reqId ? (
                        <tr>
                          <td colSpan={props.canManage ? 7 : 6}
                            style={{ background: 'var(--bg-soft, #F7F8FB)', fontSize: 11, padding: '6px 10px' }}>
                            <div style={{ whiteSpace: 'pre-wrap' }}>{r.content || t('devreq.noContent', '(상세 내용 없음)')}</div>
                            <div style={{ fontSize: 10, color: 'var(--txt-mute)', marginTop: 3 }}>
                              [{r.screenId || '-'}] {r.createdAt}{r.resolution ? ` · ${t('devreq.resolution', '처리')}: ${r.resolution}` : ''}
                            </div>
                            {r.imageCount ? <ReqImages reqId={r.reqId} /> : null}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
