"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Pencil,
  FolderInput,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBookmarkStore } from "@/stores/bookmark-store";
import { cn } from "@/lib/utils";
import type { Bookmark } from "@/types";

interface BookmarkCardProps {
  bookmark: Bookmark;
}

export function BookmarkCard({ bookmark }: BookmarkCardProps) {
  const { deleteBookmark } = useBookmarkStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editNote, setEditNote] = useState(bookmark.note);
  const [showActions, setShowActions] = useState(false);

  const handleSaveNote = async () => {
    // In a real app, this would call an API to update the note
    setIsEditing(false);
  };

  return (
    <Card className="group">
      <CardContent className="p-4 space-y-3">
        {/* Highlighted Text Quote */}
        <div className="border-l-2 border-primary pl-3">
          <p className="text-sm italic text-muted-foreground leading-relaxed">
            {bookmark.highlightedText}
          </p>
        </div>

        {/* User Note */}
        {isEditing ? (
          <div className="flex gap-2">
            <Input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder="Add a note..."
              className="text-sm"
              onKeyDown={(e) => e.key === "Enter" && handleSaveNote()}
            />
            <Button size="sm" onClick={handleSaveNote}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsEditing(false);
                setEditNote(bookmark.note);
              }}
            >
              Cancel
            </Button>
          </div>
        ) : bookmark.note ? (
          <p className="text-sm">{bookmark.note}</p>
        ) : null}

        {/* Tags */}
        {bookmark.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {bookmark.tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Footer: Source + Actions */}
        <div className="flex items-center justify-between pt-1">
          <Link
            href={`/chat/${bookmark.conversationId}`}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            View conversation
          </Link>

          {/* Actions */}
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => setShowActions(!showActions)}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>

            {showActions && (
              <div className="absolute right-0 bottom-full mb-1 w-40 rounded-sm border bg-card shadow-md z-10 py-1">
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setShowActions(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit note
                </button>
                <button
                  onClick={() => setShowActions(false)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <FolderInput className="h-3.5 w-3.5" />
                  Move to folder
                </button>
                <button
                  onClick={() => {
                    deleteBookmark(bookmark.id);
                    setShowActions(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
