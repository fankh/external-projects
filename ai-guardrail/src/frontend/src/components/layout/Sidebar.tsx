"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageSquare,
  FileText,
  LayoutDashboard,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Shield,
  Bookmark,
  History,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PersonaSelector } from "@/components/chat/PersonaSelector";
import { useUIStore } from "@/stores/ui-store";
import { useChatStore } from "@/stores/chat-store";
import { api } from "@/lib/api";
import { useShortcut } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types";
import { formatDistanceToNow } from "date-fns";

const navItems = [
  { href: "/chat", icon: MessageSquare, label: "Chat" },
  { href: "/documents", icon: FileText, label: "Documents" },
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/bookmarks", icon: Bookmark, label: "Bookmarks" },
  { href: "/history", icon: History, label: "History" },
  { href: "/analytics", icon: BarChart3, label: "Analytics" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const {
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversation,
  } = useChatStore();

  useEffect(() => {
    api
      .get<Conversation[]>("/conversations")
      .then(setConversations)
      .catch(() => {});
  }, [setConversations]);

  const handleNewChat = () => {
    setActiveConversation(null);
    router.push("/chat");
  };

  useShortcut({
    key: "n",
    shift: true,
    description: "New conversation",
    scope: "navigation",
    handler: handleNewChat,
  });
  useShortcut({
    key: "d",
    shift: true,
    description: "Dashboard",
    scope: "navigation",
    handler: () => router.push("/dashboard"),
  });

  return (
    <aside role="complementary" aria-label="Sidebar" data-tutorial="sidebar"
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-200",
        sidebarCollapsed ? "w-16" : "w-72"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center border-b px-4">
        <Shield className="h-6 w-6 text-primary shrink-0" />
        {!sidebarCollapsed && (
          <span className="ml-2 text-lg font-bold">KYRA AI</span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-8 w-8"
          onClick={toggleSidebar}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="p-3">
        <Button
          onClick={handleNewChat} data-tutorial="new-chat"
          className={cn("w-full", sidebarCollapsed && "px-0")}
          size={sidebarCollapsed ? "icon" : "default"}
        >
          <Plus className="h-4 w-4" />
          {!sidebarCollapsed && <span className="ml-2">New Chat</span>}
        </Button>
      </div>

      {/* Persona Selector */}
      {!sidebarCollapsed && (
        <div className="px-3 pb-2">
          <PersonaSelector />
        </div>
      )}

      {/* Navigation */}
      <nav aria-label="Main navigation" className="px-2 pb-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}>
              <div
                className={cn(
                  "relative flex items-center rounded-sm px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "nav-link-active bg-accent/50 text-accent-foreground font-semibold"
                    : "text-muted-foreground font-medium hover:bg-muted hover:text-foreground",
                  sidebarCollapsed && "justify-center px-0"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && (
                  <span className="ml-3">{item.label}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Conversation List */}
      {!sidebarCollapsed && (
        <>
          <div className="px-4 pt-4 pb-1">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              Recent Conversations
            </p>
          </div>
          <ScrollArea className="flex-1 px-3">
            <div className="space-y-1 pb-4">
              {conversations.map((conv) => (
                <Link key={conv.id} href={`/chat/${conv.id}`}>
                  <div
                    className={cn(
                      "relative flex flex-col rounded-sm px-3 py-2 text-sm transition-colors hover:bg-muted cursor-pointer",
                      activeConversationId === conv.id
                        ? "nav-link-active bg-accent/40 text-accent-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="font-medium truncate">{conv.title}</span>
                    <span className="text-xs text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(conv.updatedAt), {
                        addSuffix: true,
                      })}
                    </span>
                  </div>
                </Link>
              ))}
              {conversations.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  No conversations yet
                </p>
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  );
}
