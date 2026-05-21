"use client";

import React, { useState } from "react";
import {
  Link2,
  Mail,
  Copy,
  Check,
  Clock,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationId: string;
  conversationTitle: string;
}

type ShareTab = "link" | "email";

const EXPIRATION_OPTIONS = [
  { label: "1 day", value: 1 },
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
];

export function ShareDialog({
  open,
  onOpenChange,
  conversationId,
  conversationTitle,
}: ShareDialogProps) {
  const [activeTab, setActiveTab] = useState<ShareTab>("link");
  const [shareLink, setShareLink] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [expiration, setExpiration] = useState(7);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Options
  const [includeQuestion, setIncludeQuestion] = useState(true);
  const [includeThread, setIncludeThread] = useState(false);
  const [includeCitations, setIncludeCitations] = useState(true);

  const handleGenerateLink = async () => {
    setIsGenerating(true);
    try {
      const data = await api.post<{ url: string }>("/share/link", {
        conversationId,
        expirationDays: expiration,
        includeQuestion,
        includeThread,
        includeCitations,
      });
      setShareLink(data.url);
    } catch {
      setShareLink(
        `${window.location.origin}/shared/${conversationId}?exp=${expiration}d`
      );
    }
    setIsGenerating(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendEmail = async () => {
    if (!recipientEmail.trim()) return;
    setIsSending(true);
    try {
      await api.post("/share/email", {
        conversationId,
        recipientEmail,
        note: emailNote,
        includeQuestion,
        includeThread,
        includeCitations,
      });
      setRecipientEmail("");
      setEmailNote("");
    } catch {}
    setIsSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share Conversation</DialogTitle>
          <DialogDescription>
            Share &quot;{conversationTitle}&quot; with others
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b">
          {[
            { id: "link" as const, label: "Link", icon: Link2 },
            { id: "email" as const, label: "Email", icon: Mail },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {/* Link Tab */}
          {activeTab === "link" && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Link Expiration
                </label>
                <div className="flex gap-2">
                  {EXPIRATION_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setExpiration(opt.value)}
                      className={cn(
                        "rounded-sm border px-3 py-1.5 text-sm transition-colors",
                        expiration === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-input text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {shareLink ? (
                <div className="flex gap-2">
                  <Input value={shareLink} readOnly className="text-xs" />
                  <Button variant="outline" size="icon" onClick={handleCopy}>
                    {copied ? (
                      <Check className="h-4 w-4 text-[hsl(var(--success))]" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={handleGenerateLink}
                  disabled={isGenerating}
                  className="w-full"
                >
                  {isGenerating ? "Generating..." : "Generate Share Link"}
                </Button>
              )}
            </>
          )}

          {/* Email Tab */}
          {activeTab === "email" && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Recipient Email</label>
                <Input
                  type="email"
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="colleague@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  Note (optional)
                </label>
                <textarea
                  value={emailNote}
                  onChange={(e) => setEmailNote(e.target.value)}
                  placeholder="Check out this conversation..."
                  className="flex min-h-[60px] w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
                  rows={2}
                />
              </div>
            </>
          )}

          {/* Options */}
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Include in share</p>
            {[
              {
                label: "Original question",
                checked: includeQuestion,
                onChange: setIncludeQuestion,
              },
              {
                label: "Full conversation thread",
                checked: includeThread,
                onChange: setIncludeThread,
              },
              {
                label: "Citations and sources",
                checked: includeCitations,
                onChange: setIncludeCitations,
              },
            ].map((opt) => (
              <label
                key={opt.label}
                className="flex items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={() => opt.onChange(!opt.checked)}
                  className="rounded border-input"
                />
                {opt.label}
              </label>
            ))}
          </div>

          {/* Preview */}
          <div className="rounded-sm border bg-muted/50 p-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              Preview
            </p>
            <p className="text-sm font-medium">{conversationTitle}</p>
            <p className="text-xs text-muted-foreground">
              {[
                includeQuestion && "Question",
                includeThread && "Full thread",
                includeCitations && "Citations",
              ]
                .filter(Boolean)
                .join(" + ") || "No content selected"}
            </p>
          </div>
        </div>

        {activeTab === "email" && (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={isSending || !recipientEmail.trim()}
            >
              {isSending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
