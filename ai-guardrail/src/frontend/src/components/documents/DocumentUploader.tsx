"use client";

import React, { useState, useCallback, useRef } from "react";
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatFileSize } from "@/lib/utils";
import { api } from "@/lib/api";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
];

const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

interface UploadingFile {
  file: File;
  progress: number;
  status: "uploading" | "success" | "error";
  error?: string;
}

interface DocumentUploaderProps {
  collectionId?: string;
  onUploadComplete?: () => void;
}

export function DocumentUploader({
  collectionId,
  onUploadComplete,
}: DocumentUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadingFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum size: ${formatFileSize(MAX_FILE_SIZE)}`;
    }
    return null;
  };

  const uploadFile = useCallback(
    async (file: File) => {
      const error = validateFile(file);
      if (error) {
        setUploads((prev) => [
          ...prev,
          { file, progress: 0, status: "error", error },
        ]);
        return;
      }

      const idx = uploads.length;
      setUploads((prev) => [
        ...prev,
        { file, progress: 0, status: "uploading" },
      ]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        if (collectionId) formData.append("collection_id", collectionId);

        // Simulate progress since fetch doesn't support progress natively
        const progressInterval = setInterval(() => {
          setUploads((prev) =>
            prev.map((u, i) =>
              u.file === file && u.status === "uploading"
                ? { ...u, progress: Math.min(u.progress + 10, 90) }
                : u
            )
          );
        }, 200);

        await api.upload("/documents/upload", formData);

        clearInterval(progressInterval);
        setUploads((prev) =>
          prev.map((u) =>
            u.file === file ? { ...u, progress: 100, status: "success" } : u
          )
        );
        onUploadComplete?.();
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) =>
            u.file === file
              ? {
                  ...u,
                  status: "error",
                  error: (err as Error).message || "Upload failed",
                }
              : u
          )
        );
      }
    },
    [collectionId, onUploadComplete, uploads.length]
  );

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      Array.from(files).forEach(uploadFile);
    },
    [uploadFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const removeUpload = (idx: number) => {
    setUploads((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center rounded-sm border-2 border-dashed p-8 transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
        )}
      >
        <Upload
          className={cn(
            "h-10 w-10 mb-3",
            isDragging ? "text-primary" : "text-muted-foreground"
          )}
        />
        <p className="text-sm font-medium mb-1">
          {isDragging ? "Drop files here" : "Drag and drop files here"}
        </p>
        <p className="text-xs text-muted-foreground mb-3">
          or click to browse
        </p>
        <p className="text-xs text-muted-foreground">
          Supported: PDF, DOCX, TXT, MD (max 50MB)
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Upload list */}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((upload, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 rounded-sm border p-3"
            >
              <File className="h-5 w-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {upload.file.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(upload.file.size)}
                </p>
                {upload.status === "uploading" && (
                  <div className="mt-1 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${upload.progress}%` }}
                    />
                  </div>
                )}
                {upload.status === "error" && (
                  <p className="text-xs text-destructive mt-0.5">
                    {upload.error}
                  </p>
                )}
              </div>
              <div className="shrink-0">
                {upload.status === "success" ? (
                  <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
                ) : upload.status === "error" ? (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                ) : (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
              </div>
              <button
                onClick={() => removeUpload(idx)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
