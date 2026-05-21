"use client";

import React, { useEffect, useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { FolderList } from "@/components/bookmarks/FolderList";
import { BookmarkCard } from "@/components/bookmarks/BookmarkCard";
import { useBookmarkStore } from "@/stores/bookmark-store";

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

export default function BookmarksPage() {
  const {
    bookmarks,
    isLoading,
    searchQuery,
    fetchBookmarks,
    fetchFolders,
    searchBookmarks,
    setSearchQuery,
    createFolder,
  } = useBookmarkStore();

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[4]);

  useEffect(() => {
    fetchBookmarks();
    fetchFolders();
  }, [fetchBookmarks, fetchFolders]);

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    if (value.trim()) {
      searchBookmarks(value);
    } else {
      fetchBookmarks();
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await createFolder(newFolderName.trim(), newFolderColor);
    setNewFolderName("");
    setNewFolderColor(FOLDER_COLORS[4]);
    setCreateFolderOpen(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Bookmarks</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Save and organize important conversation highlights
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search bookmarks..."
            className="pl-9"
          />
        </div>

        <div className="flex gap-6">
          {/* Folder Sidebar */}
          <div className="w-56 shrink-0">
            <FolderList onCreateFolder={() => setCreateFolderOpen(true)} />
          </div>

          {/* Bookmark Cards */}
          <div className="flex-1">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : bookmarks.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No bookmarks found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Highlight text in a conversation to create a bookmark
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {bookmarks.map((bookmark) => (
                  <BookmarkCard key={bookmark.id} bookmark={bookmark} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create Folder Dialog */}
        <Dialog open={createFolderOpen} onOpenChange={setCreateFolderOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Folder Name</label>
                <Input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="My folder"
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Color</label>
                <div className="flex gap-2">
                  {FOLDER_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setNewFolderColor(color)}
                      className={cn(
                        "h-7 w-7 rounded-full transition-transform",
                        newFolderColor === color && "ring-2 ring-offset-2 ring-primary scale-110"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateFolderOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

