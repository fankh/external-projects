import { create } from "zustand";
import { api } from "@/lib/api";
import type { Bookmark, BookmarkFolder } from "@/types";

interface BookmarkState {
  bookmarks: Bookmark[];
  folders: BookmarkFolder[];
  selectedFolderId: string | null;
  searchQuery: string;
  isLoading: boolean;

  fetchBookmarks: (folderId?: string | null) => Promise<void>;
  createBookmark: (bookmark: Omit<Bookmark, "id" | "createdAt">) => Promise<void>;
  deleteBookmark: (id: string) => Promise<void>;
  searchBookmarks: (query: string) => Promise<void>;
  setSelectedFolderId: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  fetchFolders: () => Promise<void>;
  createFolder: (name: string, color: string) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  reorderFolders: (folderIds: string[]) => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarks: [],
  folders: [],
  selectedFolderId: null,
  searchQuery: "",
  isLoading: false,

  fetchBookmarks: async (folderId) => {
    set({ isLoading: true });
    try {
      const params = folderId ? `?folderId=${folderId}` : "";
      const data = await api.get<Bookmark[]>(`/bookmarks${params}`);
      set({ bookmarks: data });
    } catch {}
    set({ isLoading: false });
  },

  createBookmark: async (bookmark) => {
    try {
      const created = await api.post<Bookmark>("/bookmarks", bookmark);
      set((state) => ({ bookmarks: [created, ...state.bookmarks] }));
    } catch {}
  },

  deleteBookmark: async (id) => {
    try {
      await api.delete(`/bookmarks/${id}`);
      set((state) => ({
        bookmarks: state.bookmarks.filter((b) => b.id !== id),
      }));
    } catch {}
  },

  searchBookmarks: async (query) => {
    set({ isLoading: true, searchQuery: query });
    try {
      const data = await api.get<Bookmark[]>(
        `/bookmarks/search?q=${encodeURIComponent(query)}`
      );
      set({ bookmarks: data });
    } catch {}
    set({ isLoading: false });
  },

  setSelectedFolderId: (id) => {
    set({ selectedFolderId: id });
    get().fetchBookmarks(id);
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  fetchFolders: async () => {
    try {
      const data = await api.get<BookmarkFolder[]>("/bookmarks/folders");
      set({ folders: data });
    } catch {}
  },

  createFolder: async (name, color) => {
    try {
      const folder = await api.post<BookmarkFolder>("/bookmarks/folders", {
        name,
        color,
      });
      set((state) => ({ folders: [...state.folders, folder] }));
    } catch {}
  },

  deleteFolder: async (id) => {
    try {
      await api.delete(`/bookmarks/folders/${id}`);
      set((state) => ({
        folders: state.folders.filter((f) => f.id !== id),
        selectedFolderId:
          state.selectedFolderId === id ? null : state.selectedFolderId,
      }));
    } catch {}
  },

  reorderFolders: async (folderIds) => {
    try {
      await api.put("/bookmarks/folders/reorder", { folderIds });
      const reordered = folderIds
        .map((id, i) => {
          const folder = get().folders.find((f) => f.id === id);
          return folder ? { ...folder, sortOrder: i } : null;
        })
        .filter(Boolean) as BookmarkFolder[];
      set({ folders: reordered });
    } catch {}
  },
}));
