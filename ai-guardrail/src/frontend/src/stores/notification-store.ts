import { create } from "zustand";
import { api } from "@/lib/api";
import type { Notification } from "@/types";

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;

  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,

  fetchNotifications: async () => {
    set({ isLoading: true });
    try {
      const data = await api.get<Notification[]>("/notifications");
      const unread = data.filter((n) => n.status === "unread").length;
      set({ notifications: data, unreadCount: unread });
    } catch {}
    set({ isLoading: false });
  },

  markAsRead: async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      set((state) => {
        const updated = state.notifications.map((n) =>
          n.id === id
            ? { ...n, status: "read" as const, readAt: new Date().toISOString() }
            : n
        );
        return {
          notifications: updated,
          unreadCount: updated.filter((n) => n.status === "unread").length,
        };
      });
    } catch {}
  },

  markAllAsRead: async () => {
    try {
      await api.put("/notifications/read-all");
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          status: "read" as const,
          readAt: n.readAt ?? new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch {}
  },
}));
