"use client";

import React, { useState } from "react";
import {
  FileText,
  FileType,
  File,
  MoreVertical,
  Trash2,
  Eye,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/lib/utils";
import { api } from "@/lib/api";
import { format } from "date-fns";
import type { Document } from "@/types";

const fileTypeIcons: Record<string, React.ElementType> = {
  pdf: FileText,
  docx: FileType,
  txt: File,
  md: FileText,
};

const statusVariants: Record<string, "info" | "warning" | "success" | "destructive"> = {
  uploading: "info",
  processing: "warning",
  indexed: "success",
  failed: "destructive",
};

interface DocumentListProps {
  documents: Document[];
  onRefresh: () => void;
}

export function DocumentList({ documents, onRefresh }: DocumentListProps) {
  const [deleteDoc, setDeleteDoc] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!deleteDoc) return;
    setIsDeleting(true);
    try {
      await api.delete(`/documents/${deleteDoc.id}`);
      onRefresh();
    } catch {}
    setIsDeleting(false);
    setDeleteDoc(null);
  };

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-1">No documents yet</h3>
        <p className="text-sm text-muted-foreground">
          Upload documents to start building your knowledge base
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-sm border">
        <div className="grid grid-cols-[1fr_100px_100px_120px_40px] gap-4 px-4 py-3 border-b bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          <span>Name</span>
          <span>Type</span>
          <span>Size</span>
          <span>Status</span>
          <span></span>
        </div>
        {documents.map((doc) => {
          const Icon = fileTypeIcons[doc.fileType] || File;
          return (
            <div
              key={doc.id}
              className="grid grid-cols-[1fr_100px_100px_120px_40px] gap-4 px-4 py-3 border-b last:border-b-0 items-center hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Icon className="h-5 w-5 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {doc.uploadedAt
                      ? format(new Date(doc.uploadedAt), "MMM d, yyyy")
                      : ""}
                  </p>
                </div>
              </div>
              <span className="text-sm text-muted-foreground uppercase">
                {doc.fileType}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatFileSize(doc.fileSize)}
              </span>
              <Badge variant={statusVariants[doc.status] || "secondary"}>
                {doc.status}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleteDoc(doc)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        })}
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleteDoc} onOpenChange={() => setDeleteDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deleteDoc?.name}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDoc(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
