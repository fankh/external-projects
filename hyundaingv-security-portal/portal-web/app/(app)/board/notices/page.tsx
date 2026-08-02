import { revalidatePath } from 'next/cache'
import { Card, Chip, ScreenHeader } from '@/components/ui'
import { requireRole } from '@/lib/authz'
import { today } from '@/lib/dates'
import { getStore } from '@/lib/store'
import type { Notice } from '@/lib/types'

const CATS: Notice['category'][] = ['공지', '보안', '시스템']

async function addNotice(formData: FormData) {
  'use server'
  const me = await requireRole('BIZ_MGR', 'ADMIN')
  const title = String(formData.get('title') ?? '').trim().slice(0, 120)
  const category = String(formData.get('category') ?? '') as Notice['category']
  if (!title || !CATS.includes(category)) return

  const s = getStore()
  const max = s.notices.reduce((m, n) => Math.max(m, Number(n.id.replace('NT-', '')) || 0), 0)
  s.notices.unshift({ id: `NT-${max + 1}`, title, category, author: me.name, postedAt: today(), pinned: formData.get('pinned') === 'on' })
  revalidatePath('/', 'layout')
}

export default async function NoticesPage() {
  const me = await requireRole('USER', 'DEPT_MGR', 'BIZ_MGR', 'ADMIN')
  const canPost = me.role === 'BIZ_MGR' || me.role === 'ADMIN'
  const s = getStore()
  const rows = [...s.notices].sort((a, b) =>
    Number(b.pinned ?? false) - Number(a.pinned ?? false) || b.postedAt.localeCompare(a.postedAt),
  )

  return (
    <>
      <ScreenHeader kicker="Main" title="공지사항" desc="전사 공지 — 고정 공지가 상단에 노출된다." />

      {canPost && (
        <Card title="공지 등록" kicker="New">
          <form action={addNotice} className="hstack">
            <select className="select" name="category">
              {CATS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="input" name="title" required maxLength={120} placeholder="공지 제목" style={{ flex: 1 }} />
            <label className="hstack" style={{ gap: 5, fontSize: 11.5, color: 'var(--dim)', cursor: 'pointer' }}>
              <input type="checkbox" name="pinned" /> 고정
            </label>
            <button type="submit" className="btn pri">등록</button>
          </form>
        </Card>
      )}

      <Card title="공지 목록" kicker="Notices" pad={false}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>분류</th><th>제목</th><th>작성자</th><th>게시일</th></tr></thead>
            <tbody>
              {rows.map((n) => (
                <tr key={n.id}>
                  <td><Chip tone={n.category === '보안' ? 'err' : n.category === '시스템' ? 'info' : 'neutral'} bare>{n.category}</Chip></td>
                  <td className={n.pinned ? 'strong' : ''}>{n.pinned ? '📌 ' : ''}{n.title}</td>
                  <td>{n.author}</td>
                  <td className="tnum">{n.postedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
