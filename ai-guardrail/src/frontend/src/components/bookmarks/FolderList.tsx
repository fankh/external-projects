"use client";

import React, { useState, useRef, useEffect } from "react";
import { Bookmark, FolderPlus, Pencil, Trash2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBookmarkStore } from "@/stores/bookmark-store";
import { cn } from "@/lib/utils";

interface FolderListProps {
  onCreateFolder: () => void;
}

const FOLDER_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
];

export function FolderList({ onCreateFolder }: FolderListProps) {
  const {
    folders,
    selectedFolderId,
    setSelectedFolderId,
    bookmarks,
    deleteFolder,
  } = useBookmarkStore();

  const [contextMenu, setContextMenu] = useState<{
    folderId: string;
    x: number;
    y: number;
  } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextRef.current && !contextRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [contextMenu]);

  const handleContextMenu = (
    e: React.MouseEvent,
    folderId: string
  ) => {
    e.preventDefault();
    setContextMenu({ folderId, x: e.clientX, y: e.clientY });
  };

  const totalBookmarks = bookmarks.length;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Folders
        </p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onCreateFolder}
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* All Bookmarks */}
      <button
        onClick={() => setSelectedFolderId(null)}
        className={cn(
          "flex items-center justify-between w-full rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent",
          selectedFolderId === null
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground"
        )}
      >
        <div className="flex items-center gap-2">
          <Bookmark className="h-4 w-4" />
          <span>All Bookmarks</span>
        </div>
        <span className="text-xs text-muted-foreground">{totalBookmarks}</span>
      </button>

      {/* Folder Items */}
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => setSelectedFolderId(folder.id)}
          onContextMenu={(e) => handleContextMenu(e, folder.id)}
          className={cn(
            "flex items-center justify-between w-full rounded-sm px-3 py-2 text-sm transition-colors hover:bg-accent",
            selectedFolderId === folder.id
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground"
          )}
        >
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: folder.color }}
            />
            <span className="truncate">{folder.name}</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {folder.bookmarkCount}
          </span>
        </button>
      ))}

      {folders.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-3">
          No folders yet
        </p>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className="fixed z-50 w-40 rounded-sm border bg-card shadow-md py-1"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => setContextMenu(null)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            Rename
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors"
          >
            <Palette className="h-3.5 w-3.5" />
            Change color
          </button>
          <button
            onClick={() => {
              deleteFolder(contextMenu.folderId);
              setContextMenu(null);
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
