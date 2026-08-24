'use server'
import { revalidatePath } from 'next/cache'
import { appendAudit } from '@/lib/audit'
import { isQnaOverdue, isValidDate, qnaAgeDays, today } from '@/lib/dates'
import { noticeTargets } from '@/lib/notice'
import { dispatch } from '@/lib/notify'
import { getSession } from '@/lib/session'
import { getStore, nextId } from '@/lib/store'
import { qnaRemindTargets } from '@/lib/reminders'
import { NOTICE_CATEGORIES } from '@/lib/types'
import type { NoticeCategory, QnaCategory } from '@/lib/types'

/** 게시글 조회수 증가 — 공지·QnA 상세를 열 때 조회수를 1 올린다(§01 게시판 조회수).
 *  그동안 views 는 시드 값에 고정돼 있었다(증가 접점 부재). 로그인 사용자면 누구나 조회로 집계된다. */
export async function recordPostView(postId: string) {
  const session = await getSession()
  if (!session) return { ok: false, views: 0 }
  const s = getStore()
  const post = s.posts.find((p) => p.id === postId)
  if (!post) return { ok: false, views: 0 }
  post.views = (post.views ?? 0) + 1
  revalidatePath('/', 'layout')
  return { ok: true, views: post.views }
}

/** QnA 질문 등록 — 전 권한그룹이 사용 가능 (사용자의 유일한 쓰기 접점) */
export async function askQuestion(title: string, body: string, category: QnaCategory) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }

  const s = getStore()
  const id = nextId('QNA')
  s.posts.unshift({
    id,
    kind: 'QnA',
    title: title.trim(),
    body: body.trim(),
    author: session.name,
    dept: session.dept,
    createdAt: today(),
    views: 0,
    category,
  })
  // 분류별 담당 팀에 새 문의 접수를 통보한다 — 그동안 담당자는 게시판을 직접 봐야 답변 대기 문의를 알 수 있었다
  // (작성자 답변 통보(v1.136)의 반대 방향 — 질문 접수 측 루프 폐쇄). 알림 참조는 문의 id 라 발송 이력에서 바로 문의로 딥링크된다.
  const team = category === '보안·Discovery' ? '보안운영팀' : category === '라이선스' ? 'IT기획팀' : '자산관리팀'
  dispatch({ channel: '이메일', to: team, subject: `[QnA 접수] ${category} — '${title.trim()}' (${session.name})`, kind: 'QnA 접수', ref: id })
  appendAudit({ actor: session.name, action: `QnA 문의 등록 (${category}) · ${team} 통보`, target: id })
  revalidatePath('/', 'layout')
  return { ok: true, message: `질문이 등록되었습니다 — ${team}에 접수 통보. 담당자 답변 후 알림을 받습니다.` }
}

/** QnA 답변 — 자산담당·보안담당·Admin */
export async function answerQuestion(postId: string, body: string) {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: '답변 권한이 없습니다.' }
  if (!body.trim()) return { ok: false, message: '답변 내용을 입력하세요.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === 'QnA')
  if (!post) return { ok: false, message: '질문을 찾을 수 없습니다.' }
  const prevBody = post.answer?.body
  const wasAnswered = Boolean(post.answer)
  post.answer = { body: body.trim(), by: session.name, at: today() }

  // 해결 확인된 문의의 답변이 바뀌면 작성자는 '바뀌기 전 답변'으로 해결 확인한 것이라 확인이 무효 —
  // 해결 확인을 해제해 바뀐 답변을 다시 확인(또는 재문의)하게 한다(필독 공지 내용 변경 시 읽음 확인 초기화와 동형).
  const resolutionCleared = Boolean(post.resolvedAt) && wasAnswered && prevBody !== body.trim()
  if (resolutionCleared) post.resolvedAt = undefined

  // 최초 답변 시 문의 작성자에게 알림 발송(발송 이력 적재) — QnA 폼이 "답변 등록 시 알림을 받습니다"라고 약속한다.
  // 답변 수정(재저장)은 중복 발송하지 않되, 해결 확인이 해제되는 변경은 작성자가 재확인해야 하므로 통보한다.
  if (!wasAnswered) {
    dispatch({ channel: '이메일', to: post.author, subject: `[QnA] '${post.title}' 문의에 답변이 등록되었습니다 — ${session.name}`, kind: 'QnA 답변', ref: post.id })
  } else if (resolutionCleared) {
    dispatch({ channel: '이메일', to: post.author, subject: `[QnA] '${post.title}' 답변이 수정되었습니다 — 해결 확인 재요청 (${session.name})`, kind: 'QnA 답변', ref: post.id })
  }
  appendAudit({ actor: session.name, action: `QnA 답변 등록${wasAnswered ? ` (수정${resolutionCleared ? ' · 해결 확인 해제' : ''})` : ' · 작성자 통보'}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `답변이 등록되었습니다${!wasAnswered ? ` — 작성자(${post.author})에게 알림 발송` : resolutionCleared ? ' — 답변 변경으로 해결 확인이 해제돼 작성자에게 재확인을 요청했습니다' : ''}.` }
}

/** 문의 분류별 담당 팀 라우팅 — 접수 통보·독촉·재문의가 같은 팀으로 가도록 한 곳에서 정한다. */
function qnaTeamOf(c?: string) {
  return c === '보안·Discovery' ? '보안운영팀' : c === '라이선스' ? 'IT기획팀' : '자산관리팀'
}

/** QnA 해결 확인 — 문의 작성자가 답변으로 문제가 해결됐음을 확정한다(답변자 통보). 답변된 본인 문의만. */
export async function resolveQuestion(postId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }
  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === 'QnA')
  if (!post) return { ok: false, message: '문의를 찾을 수 없습니다.' }
  if (post.author !== session.name && session.role !== 'ADMIN') return { ok: false, message: '본인 문의만 해결 확인할 수 있습니다.' }
  if (!post.answer) return { ok: false, message: '답변이 등록된 문의만 해결 확인할 수 있습니다.' }
  if (post.resolvedAt) return { ok: false, message: '이미 해결 확인된 문의입니다.' }
  post.resolvedAt = today()
  dispatch({ channel: '이메일', to: post.answer.by, subject: `[QnA 해결] '${post.title}' 문의가 해결 확인되었습니다 — ${session.name}`, kind: 'QnA 해결', ref: post.id })
  appendAudit({ actor: session.name, action: `QnA 해결 확인 — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `해결 확인되었습니다 — 답변자(${post.answer.by})에게 통보` }
}

/** QnA 재문의 — 답변으로 해결되지 않아 작성자가 재검토를 요청한다(해결 확인 해제·담당 팀 통보). 답변된 본인 문의만. */
export async function reopenQuestion(postId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }
  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === 'QnA')
  if (!post) return { ok: false, message: '문의를 찾을 수 없습니다.' }
  if (post.author !== session.name && session.role !== 'ADMIN') return { ok: false, message: '본인 문의만 재문의할 수 있습니다.' }
  if (!post.answer) return { ok: false, message: '답변이 등록된 문의만 재문의할 수 있습니다.' }
  post.resolvedAt = undefined
  const team = qnaTeamOf(post.category)
  dispatch({ channel: '이메일', to: team, subject: `[QnA 재문의] '${post.title}' — 답변으로 해결되지 않아 재검토 요청 (${session.name})`, kind: 'QnA 접수', ref: post.id })
  appendAudit({ actor: session.name, action: `QnA 재문의(재검토 요청) — ${post.title} · ${team} 통보`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `재문의 접수 — 담당 팀(${team})에 재검토 요청` }
}

/** QnA 답변 독촉 — 등록 후 SLA(기본 3일)를 넘겨도 답변이 없는 문의의 담당 팀에 답변 처리를 재촉한다.
 *  (헬프데스크 SLA — 결재 지연 독촉·필독 미확인 안내와 같은 컴플라이언스 독촉. 응답 지연이 표시로만 끝나지 않게 한다.)
 *  문의 분류별 담당 팀(접수 통보와 같은 라우팅)으로 발송하고, 문의별 당일 중복 발송은 차단한다. 자산담당·보안담당·Admin. */
export async function remindQna() {
  const session = await getSession()
  if (!session || session.role === 'USER') return { ok: false, message: 'QnA 답변 독촉 권한이 없습니다 (담당자·Admin).' }
  // 대상 판정은 화면 버튼 건수와 한 소스(lib/reminders) — SLA 경과 미답변 + 당일 발송분 제외.
  let n = 0
  for (const p of qnaRemindTargets()) {
    dispatch({ channel: '이메일', to: qnaTeamOf(p.category), subject: `[QnA 답변 독촉] '${p.title}' — 등록 ${qnaAgeDays(p.createdAt)}일 경과, 답변 처리 부탁드립니다`, kind: 'QnA 독촉', ref: p.id })
    n += 1
  }
  if (n === 0) return { ok: false, message: 'QnA 답변 독촉 대상이 없습니다 (SLA 경과 미답변 없음·오늘 발송분 제외).' }
  appendAudit({ actor: session.name, action: `QnA 답변 독촉 발송 (${n}건)`, target: 'SLA 경과 미답변 QnA' })
  revalidatePath('/', 'layout')
  return { ok: true, message: `QnA 답변 독촉 ${n}건 발송 — SLA 경과 미답변 문의 담당 팀에 답변 요청 (발송 이력 적재)` }
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
export async function postNotice(title: string, body: string, pinned: boolean, publishAt?: string, category?: NoticeCategory, audienceDept?: string) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '공지 등록 권한이 없습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }
  const pub = publishAt?.trim() || undefined
  // 형식만 검증한다. 과거·오늘 날짜는 즉시 발행으로 처리(publishAt 미설정), 미래 날짜만 예약으로 남긴다.
  if (pub && !isValidDate(pub)) return { ok: false, message: '예약 발행일을 선택해 주세요.' }
  const cat: NoticeCategory = NOTICE_CATEGORIES.includes(category as NoticeCategory) ? (category as NoticeCategory) : '일반'

  const s = getStore()
  // 대상 부서 — 전사(미설정) 또는 실재 부서만 허용. 알 수 없는 부서는 전사로 처리(오타로 아무에게도 안 보이는 공지 방지).
  const aud = audienceDept && audienceDept !== '전사' && s.users.some((u) => u.dept === audienceDept) ? audienceDept : undefined
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
    category: cat,
    publishAt: pub && pub > today() ? pub : undefined,
    audienceDept: aud,
  })
  const scheduled = pub && pub > today()
  appendAudit({ actor: session.name, action: `공지 ${scheduled ? `예약 등록 (발행 ${pub})` : '등록'}${pinned ? ' · 필독 고정' : ''}${aud ? ` · 대상 ${aud}` : ''} — ${title.trim()}`, target: '공지' })
  revalidatePath('/', 'layout')
  return { ok: true, message: scheduled ? `공지가 예약되었습니다 — ${pub} 발행 예정.` : '공지가 등록되었습니다.' }
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
export async function editNotice(postId: string, title: string, body: string, pinned: boolean, category?: NoticeCategory, audienceDept?: string) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '공지 수정 권한이 없습니다.' }
  if (!title.trim() || !body.trim()) return { ok: false, message: '제목과 내용을 입력하세요.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post) return { ok: false, message: '공지를 찾을 수 없습니다.' }
  const newTitle = title.trim(), newBody = body.trim()
  // 내용(제목·본문) 변경 여부 — 필독 읽음 확인 무결성 판정에 쓴다(메타데이터 변경과 구분).
  const contentChanged = post.title !== newTitle || post.body !== newBody
  const priorAcks = post.acks?.length ?? 0
  post.title = newTitle
  post.body = newBody
  post.pinned = pinned
  if (NOTICE_CATEGORIES.includes(category as NoticeCategory)) post.category = category as NoticeCategory
  // 대상 부서 재조정 — 전사(미설정) 또는 실재 부서만. 대상을 바꾸면 필독 확인율·독촉 분모도 함께 좁혀지거나 넓어진다.
  post.audienceDept = audienceDept && audienceDept !== '전사' && s.users.some((u) => u.dept === audienceDept) ? audienceDept : undefined
  // 필독 공지 내용이 바뀌면 이전 읽음 확인은 '바뀌기 전 내용'을 확인한 것이라 무효 — 확인 이력을 초기화해
  // 변경된 내용을 다시 확인받는다(커버리지 무결성). 메타데이터(고정·분류·대상)만 바꾼 경우는 유지한다.
  const acksReset = contentChanged && priorAcks > 0
  if (acksReset) post.acks = []

  appendAudit({ actor: session.name, action: `공지 수정 — ${post.title}${post.audienceDept ? ` · 대상 ${post.audienceDept}` : ' · 대상 전사'}${acksReset ? ` · 읽음 확인 ${priorAcks}건 초기화(내용 변경)` : ''}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: acksReset ? `공지가 수정되었습니다. 내용 변경으로 읽음 확인 ${priorAcks}건이 초기화돼 재확인이 필요합니다.` : '공지가 수정되었습니다.' }
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

/** 필독 공지 읽음 확인 — 전 권한그룹이 자기 명의로 확인한다(QnA 등록과 함께 사용자의 쓰기 접점).
 *  그동안 '필독'은 상단 고정이라는 표시뿐이고 실제로 누가 읽었는지 추적이 없었다. 상단 고정(필독) 공지만
 *  대상이며, 확인 이력이 컴플라이언스 커버리지(확인 N/전체 M)로 집계된다. 재확인은 무시(멱등). */
export async function acknowledgeNotice(postId: string) {
  const session = await getSession()
  if (!session) return { ok: false, message: '세션이 만료되었습니다.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post) return { ok: false, message: '공지를 찾을 수 없습니다.' }
  if (!post.pinned) return { ok: false, message: '필독(상단 고정) 공지만 읽음 확인 대상입니다.' }

  post.acks ??= []
  if (post.acks.some((a) => a.by === session.name)) {
    return { ok: true, message: '이미 읽음 확인한 공지입니다.' }
  }
  post.acks.push({ by: session.name, at: today() })

  appendAudit({ actor: session.name, action: `공지 필독 확인 — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `읽음 확인 완료 — ${post.title}` }
}

/** 필독 공지 미확인자 안내 발송 — 읽음 확인(acknowledgeNotice) 커버리지가 100%가 아닐 때 아직 확인하지
 *  않은 사용자에게 필독 확인 요청을 통보한다(발송 이력 적재). 그동안 커버리지는 표시만 되고 독촉 수단이 없었다.
 *  상단 고정(필독) 공지만 대상. Admin. (소유자 확인 미응답 에스컬레이션과 같은 컴플라이언스 독촉 패턴) */
export async function remindNoticeUnacked(postId: string) {
  const session = await getSession()
  if (!session || session.role !== 'ADMIN') return { ok: false, message: '미확인자 안내 발송 권한이 없습니다.' }

  const s = getStore()
  const post = s.posts.find((p) => p.id === postId && p.kind === '공지')
  if (!post) return { ok: false, message: '공지를 찾을 수 없습니다.' }
  if (!post.pinned) return { ok: false, message: '필독(상단 고정) 공지만 미확인자 안내 대상입니다.' }
  // 발행 예정(publishAt 미래) 공지는 독촉 금지 — 아직 공개되지 않은 공지의 제목·존재를 발행 전에 대상자에게 노출하지 않는다
  // (대시보드 등 모든 자동 노출은 이미 이 게이트를 쓰는데 수동 독촉 경로만 빠져 있었다).
  if (post.publishAt && post.publishAt > today()) return { ok: false, message: '발행 예정 공지는 발행 후에 미확인자 안내를 보낼 수 있습니다.' }

  const acked = new Set((post.acks ?? []).map((a) => a.by))
  // 대상 부서로 좁힌 미확인자 — 전사 공지면 전 사용자, 부서 공지면 그 부서 사용자만 독촉한다.
  const unacked = noticeTargets(post, s.users).filter((u) => !acked.has(u.name))
  if (unacked.length === 0) return { ok: false, message: `${post.audienceDept ?? '전사'} 대상 전원이 이미 읽음 확인했습니다.` }

  for (const u of unacked) {
    dispatch({ channel: '이메일', to: `${u.name} (${u.dept})`, subject: `[필독 확인 요청] ${post.title} — 미확인 안내`, kind: '공지 독촉', ref: post.id })
  }
  appendAudit({ actor: session.name, action: `공지 미확인자 안내 발송 (${unacked.length}명) — ${post.title}`, target: postId })
  revalidatePath('/', 'layout')
  return { ok: true, message: `미확인 ${unacked.length}명에게 필독 확인 안내를 발송했습니다 (발송 이력에서 확인).` }
}
