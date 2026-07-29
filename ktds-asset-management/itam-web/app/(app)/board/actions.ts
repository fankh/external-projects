'use server'
import { revalidatePath } from 'next/cache'
import { TODAY } from '@/lib/dates'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import type { QnaCategory } from '@/lib/types'

/** QnA 질문 등록 — 전 권한그룹이 사용 가능 (사용자의 유일한 쓰기 접점) */
export async function askQuestion(title: string, body: string, category: QnaCategory) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }

  const s = getStore()
  s.posts.unshift({
    id: nextId('QNA'),
    kind: 'QnA',
    title: title.trim(),
    body: body.trim(),
    author: session.name,
    dept: session.dept,
    createdAt: TODAY,
    views: 0,
    category,
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: '질문이 등록되었습니다. 담당자 답변 후 알림을 받습니다.' }
}

/** QnA 답변 — 자산담당·보안담당·Admin */
export async function answerQuestion(postId: string, body: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '답변 권한이 없습니다.' }
  if (!body.trim()) return { ok: false, message: '답변 내용을 입력하세요.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === 'QnA')
  if (!post) return { ok: false, message: '질문을 찾을 수 없습니다.' }
  post.answer = { body: body.trim(), by: session.name, at: TODAY }

  s.seq += 1
  s.auditLogs.unshift({
    id: `AUD-${9000 + s.seq}`, at: `${TODAY} 12:00:00`, actor: session.name,
    action: 'QnA 답변 등록', target: postId, result: '성공', ip: '10.20.31.45',
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: '답변이 등록되었습니다.' }
}

/** 공지 등록 — Admin */
export async function postNotice(title: string, body: string, pinned: boolean) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '공지 등록 권한이 없습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }

  const s = getStore()
  s.posts.unshift({
    id: nextId('NTC'),
    kind: '공지',
    title: title.trim(),
    body: body.trim(),
    author: session.name,
    dept: session.dept,
    createdAt: TODAY,
    views: 0,
    pinned,
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: '공지가 등록되었습니다.' }
}
