"use client";

import React, { useState } from "react";
import { ThemeProvider } from "next-themes";
import { ShortcutProvider } from "@/lib/shortcuts";
import { ShortcutHelp } from "@/components/shortcuts/ShortcutHelp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./globals.css";

function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
        <title>KYRA AI Guardrail</title>
        <meta name="description" content="KYRA AI Guardrail - Secure AI Assistant" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-2 focus:bg-primary focus:text-primary-foreground">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
