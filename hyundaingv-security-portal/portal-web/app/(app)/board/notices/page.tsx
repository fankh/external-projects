import { revalidatePath } from 'next/cache'
import { Card, Chip, Clip, ScreenHeader } from '@/components/ui'
import { Icon } from '@/components/chrome/Icon'
import { attachCount, registerUpload } from '@/lib/attachments'
import { audit } from '@/lib/audit'
import { requireMenu, requireMenuRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import type { Notice } from '@/lib/types'

const CATS: Notice['category'][] = ['공지', '보안', '시스템', '교육']

async function addNotice(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/board/notices', 'BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const category = String(formData.get('category') ?? '') as Notice['category']
  if (!title || !CATS.includes(category)) return

  const s = getStore()
  const max = s.notices.reduce((m, n) => Math.max(m, Number(n.id.replace('NT-', '')) || 0), 0)
  const id = `NT-${max + 1}`
  s.notices.unshift({ id, title, category, author: me.name, postedAt: today(), pinned: formData.get('pinned') === 'on' })
  // 공지 첨부 — 게시/공지 이력의 원본 문서를 함께 남긴다 (첨부 시트: 공지사항·게시/공지이력관리)
  registerUpload(id, formData.get('file'), me.name)
  revalidatePath('/', 'layout')
}

/** 공지 삭제 — 작성자 본인 또는 Admin (요구사항 6행 삭제 ◎). 첨부도 함께 정리한다 */
async function deleteNotice(formData: FormData) {
  'use server'
  const me = await requireMenuRole('/board/notices', 'BIZ_MGR', 'ADMIN')
  const id = String(formData.get('id') ?? '')
  const s = getStore()
  const n = s.notices.find((x) => x.id === id)
  if (!n || (n.author !== me.name && me.role !== 'ADMIN')) return
  s.notices = s.notices.filter((x) => x.id !== id)
  s.attachments = s.attachments.filter((a) => a.refId !== id)
  audit(me.name, '게시물 삭제', `공지 ${id} — ${n.title}`)
  revalidatePath('/', 'layout')
}

export default async function NoticesPage() {
  const me = await requireMenu('/board/notices')
  const canPost = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const s = getStore()
  const rows = [...s.notices].sort((a, b) =>
    Number(b.pinned ?? false) - Number(a.pinned ?? false) || String(b.postedAt ?? '').localeCompare(String(a.postedAt ?? '')),
  )

  return (
    <>
      <ScreenHeader kicker="Main" title="공지사항" desc="전사 공지 — 고정 공지가 상단에 노출된다." />

      {canPost && (
        <Card title="공지 등록">
          <form action={addNotice} className="hstack">
            <select aria-label="항목" className="select" name="category">
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input aria-label="공지 제목" className="input" name="title" required maxLength={120} placeholder="공지 제목" style={{ flex: 1 }} />
            <label className="hstack" style={{ gap: 5, fontSize: 11.5, color: 'var(--dim)', cursor: 'pointer' }}>
              <input aria-label="고정" type="checkbox" name="pinned" /> 고정
            </label>
            <input className="input" type="file" name="file" style={{ width: 150, paddingTop: 4 }} title="공지 첨부" />
            <button type="submit" className="btn pri">등록</button>
          </form>
        </Card>
      )}

      <Card title="공지 목록" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>분류</th><th>제목</th><th>작성자</th><th>게시일</th></tr></thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id}>
                  <td><Chip tone={n.category === '보안' ? 'err' : n.category === '시스템' ? 'info' : n.category === '교육' ? 'ok' : 'neutral'} bare>{n.category}</Chip></td>
                  <td className={n.pinned ? 'strong' : ''}>{n.pinned && <Icon name="pin" size={12} aria-label="고정" style={{ marginRight: 4, verticalAlign: '-1px' }} />}{n.title}<Clip count={attachCount(n.id)} title="공지 첨부" /></td>
                  <td>{n.author}</td>
                  <td className="tnum">
                    {n.postedAt}
                    {(n.author === me.name || me.role === 'ADMIN') && canPost && (
                      <form action={deleteNotice} style={{ display: 'inline', marginLeft: 6 }}>
                        <input type="hidden" name="id" value={n.id} />
                        <button type="submit" className="btn sm danger">삭제</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
