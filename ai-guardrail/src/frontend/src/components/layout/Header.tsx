"use client";

import React, { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Search, Moon, Sun, LogOut, User, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { useShortcut } from "@/lib/shortcuts";
import { useTheme } from "next-themes";
import { getInitials } from "@/lib/utils";

const breadcrumbLabels: Record<string, string> = {
  chat: "Chat",
  documents: "Documents",
  dashboard: "Dashboard",
  settings: "Settings",
};

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useTheme();

  const [searchQ, setSearchQ] = useState("");
  const [searchHits, setSearchHits] = useState<{id:string;conversationId:string;content:string;role:string;createdAt:string}[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = searchQ.trim();
    if (q.length < 2) { setSearchHits([]); return; }
    const t = setTimeout(async () => {
      try {
        const hits = await api.get<{id:string;conversationId:string;content:string;role:string;createdAt:string}[]>(`/conversations/search?q=${encodeURIComponent(q)}&limit=15`);
        setSearchHits(hits || []);
        setSearchOpen(true);
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useShortcut({
    key: "/",
    description: "Focus search",
    scope: "navigation",
    handler: () => {
      const el = document.querySelector<HTMLInputElement>('input[placeholder="Search messages..." aria-label="Search conversations" data-tutorial="search"]');
      el?.focus();
    },
  });

  const segments = pathname.split("/").filter(Boolean);
  const currentSection = segments[0] || "chat";

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <header role="banner" className="flex h-14 items-center border-b border-border bg-card px-4 gap-4">
      {/* Breadcrumb */}
      <nav className="flex items-center text-sm">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {breadcrumbLabels[currentSection] || currentSection}
        </span>
        {segments.length > 1 && (
          <>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="text-muted-foreground truncate max-w-[200px]">
              {segments.slice(1).join("/")}
            </span>
          </>
        )}
      </nav>

      {/* Search */}
      <div className="flex-1 max-w-md mx-auto" ref={searchRef}>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search messages..." aria-label="Search conversations" data-tutorial="search"
            className="pl-8 h-9 bg-muted/60 border-transparent focus-visible:bg-background"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onFocus={() => searchHits.length > 0 && setSearchOpen(true)}
          />
          {searchOpen && searchHits.length > 0 && (
            <div className="absolute left-0 right-0 top-10 z-50 rounded-sm border border-border bg-popover shadow-md max-h-96 overflow-auto">
              {searchHits.map((h) => (
                <a key={h.id} href={`/chat/${h.conversationId}`}
                   className="block px-3 py-2 text-xs hover:bg-muted border-b border-border last:border-0"
                   onClick={() => setSearchOpen(false)}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-mono text-[10px] text-muted-foreground uppercase">{h.role}</span>
                    <span className="text-[10px] text-muted-foreground">{new Date(h.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="line-clamp-2 text-foreground">{h.content.slice(0,200)}</div>
                </a>
              ))}
            </div>
          )}
          {searchOpen && searchQ.length >= 2 && searchHits.length === 0 && (
            <div className="absolute left-0 right-0 top-10 z-50 rounded-sm border border-border bg-popover shadow-md px-3 py-4 text-xs text-muted-foreground text-center">No results</div>
          )}
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarUrl} alt={user?.name} />
                <AvatarFallback className="text-xs">
                  {user ? getInitials(user.name) : "U"}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.email || ""}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <User className="mr-2 h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
