"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShortcutProvider } from "@/lib/shortcuts";
import { ShortcutHelp } from "@/components/shortcuts/ShortcutHelp";
import { useAuthStore } from "@/stores/auth-store";
import "./globals.css";

function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 60 * 1000, retry: 1 } },
  }));
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <ShortcutProvider>
          {children}
          <ShortcutHelp />
        </ShortcutProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, user, loadFromStorage } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => { loadFromStorage(); setChecked(true); }, [loadFromStorage]);

  useEffect(() => {
    if (checked && !isAuthenticated) router.push("/login");
    if (checked && isAuthenticated && user?.role !== "admin") router.push("/login");
  }, [checked, isAuthenticated, user, router]);

  if (!checked || !isAuthenticated || user?.role !== "admin") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }
  return <>{children}</>;
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <title>KYRA Admin Console</title>
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-primary focus:text-primary-foreground">Skip to content</a>
        <Providers>
          <AdminGuard>{children}</AdminGuard>
        </Providers>
      </body>
    </html>
  );
}
