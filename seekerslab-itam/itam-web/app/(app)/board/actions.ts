'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { today } from '@/lib/dates'
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
    createdAt: today(),
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
  post.answer = { body: body.trim(), by: session.name, at: today() }

  appendAudit({ actor: session.name, action: 'QnA 답변 등록', target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: '답변이 등록되었습니다.' }
}

/** QnA 문의 수정 — 작성자 본인 또는 Admin. 답변 전에만 가능(답변된 문의는 맥락이 고정된다). */
export async function editQuestion(postId: string, title: string, body: string, category: QnaCategory) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === 'QnA')
  if (!post) return { ok: false, message: '문의를 찾을 수 없습니다.' }
  if (post.answer) return { ok: false, message: '이미 답변된 문의는 수정할 수 없습니다.' }
  if (post.author !== session.name && session.role !== 'ADMIN') {
    return { ok: false, message: '본인 문의 또는 관리자만 수정할 수 있습니다.' }
  }
  post.title = title.trim()
  post.body = body.trim()
  post.category = category

  appendAudit({ actor: session.name, action: `QnA 문의 수정 — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: '문의가 수정되었습니다.' }
}

/** QnA 문의 삭제 — 작성자 본인 또는 Admin(중재). 잘못 올렸거나 해결된 문의를 정리한다. */
export async function deleteQuestion(postId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }
  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === 'QnA')
  if (!post) return { ok: false, message: '문의를 찾을 수 없습니다.' }
  if (post.author !== session.name && session.role !== 'ADMIN') {
    return { ok: false, message: '본인 문의 또는 관리자만 삭제할 수 있습니다.' }
  }
  s.posts = s.posts.filter((p) => p.id !== postId)
  appendAudit({ actor: session.name, action: `QnA 문의 삭제 — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: '문의가 삭제되었습니다.' }
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
    createdAt: today(),
    views: 0,
    pinned,
  })
  appendAudit({ actor: session.name, action: `공지 등록${pinned ? ' (필독 고정)' : ''} — ${title.trim()}`, target: '공지' })
  revalidatePath('/', 'layout')
  return { ok: true, message: '공지가 등록되었습니다.' }
}

/** 공지 삭제 — Admin. 등록만 있고 정리 수단이 없어 낡은 공지가 계속 남던 공백을 메운다. */
export async function deleteNotice(postId: string) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '공지 삭제 권한이 없습니다.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post) return { ok: false, message: '공지를 찾을 수 없습니다.' }
  s.posts = s.posts.filter((p) => p.id !== postId)

  appendAudit({ actor: session.name, action: `공지 삭제 — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: '공지가 삭제되었습니다.' }
}

/** 공지 수정 — Admin. 제목·내용·고정 상태를 갱신한다 (오타·정보 갱신 시 삭제·재등록 없이). */
export async function editNotice(postId: string, title: string, body: string, pinned: boolean) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '공지 수정 권한이 없습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post) return { ok: false, message: '공지를 찾을 수 없습니다.' }
  post.title = title.trim()
  post.body = body.trim()
  post.pinned = pinned

  appendAudit({ actor: session.name, action: `공지 수정 — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: '공지가 수정되었습니다.' }
}

/** 공지 상단 고정 토글 — Admin. 필독 지정·해제로 목록 상단 노출을 관리한다. */
export async function toggleNoticePin(postId: string) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '공지 고정 권한이 없습니다.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post) return { ok: false, message: '공지를 찾을 수 없습니다.' }
  post.pinned = !post.pinned

  appendAudit({ actor: session.name, action: `공지 ${post.pinned ? '상단 고정' : '고정 해제'} — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `공지를 ${post.pinned ? '상단 고정' : '고정 해제'}했습니다.` }
}
