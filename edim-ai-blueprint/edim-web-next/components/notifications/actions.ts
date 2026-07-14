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

export async function markRead(id: number): Promise<void> {
  await apiServer(`/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
}

export async function markAllRead(): Promise<void> {
  await apiServer('/notifications/read-all', { method: 'POST' }).catch(() => {})
}
