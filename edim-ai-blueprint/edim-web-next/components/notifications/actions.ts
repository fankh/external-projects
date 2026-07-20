'use server'

import { apiServer } from '@/lib/api'

export interface Notification { id: number; type: string; title: string; link: string | null; read: boolean; at: string; priority?: 'HIGH' | 'MED' | 'LOW' }
export interface NotificationDigest { unread: number; byType: Record<string, number>; overdue: number; high: number }

/** 알림 목록 (미읽음 우선). */
export async function listNotifications(unreadOnly = false, limit = 20): Promise<Notification[]> {
  const qs = new URLSearchParams()
  if (unreadOnly) qs.set('unreadOnly', 'true')
  qs.set('limit', String(limit))
  return apiServer<Notification[]>(`/notifications?${qs}`).catch(() => [])
}

/** 로그인 요약(unread/high/overdue). */
export async function notificationDigest(): Promise<NotificationDigest> {
  return apiServer<NotificationDigest>('/notifications/digest').catch(() => ({ unread: 0, byType: {}, overdue: 0, high: 0 }))
}

/** 공지 발송 (ADMIN) — 전 활성 사용자 인앱 알림 (type=ANNOUNCE). */
export async function announce(title: string, link?: string): Promise<{ sent?: number; error?: string }> {
  const { ApiError } = await import('@/lib/api')
  try {
    const r = await apiServer<{ sent: number }>('/notifications/announce', {
      method: 'POST', body: JSON.stringify({ title, link: link ?? '' }),
    })
    return { sent: r.sent }
  } catch (e) {
    return { error: e instanceof ApiError ? e.message : '공지 발송 실패' }
  }
}

export async function markRead(id: number): Promise<void> {
  await apiServer(`/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
}

export async function markAllRead(): Promise<void> {
  await apiServer('/notifications/read-all', { method: 'POST' }).catch(() => {})
}
