"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Users,
  Shield,
  ShieldCheck,
  Key,
  CreditCard,
  Cloud,
  ToggleLeft,
  FileBarChart,
  Settings,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { cn } from "@/lib/utils";

const adminTabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/users", label: "Users", icon: Users },
  { href: "/security", label: "Security", icon: Shield },
  { href: "/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/sso", label: "SSO", icon: Key },
  { href: "/billing", label: "Billing", icon: CreditCard },
  { href: "/connectors", label: "Connectors", icon: Cloud },
  { href: "/flags", label: "Flags", icon: ToggleLeft },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/system", label: "System", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setChecked(true);
  }, []);

  if (!checked) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Admin Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Console</h1>
            <a href={process.env.NEXT_PUBLIC_CHAT_URL || "/"} target="_blank" rel="noreferrer"
               className="text-xs text-muted-foreground hover:text-foreground">
              Open Chat App &rarr;
            </a>
            <p className="text-sm text-muted-foreground mt-1">
              Manage users, security, and system configuration
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex gap-1 border-b">
          {adminTabs.map((tab) => {
            const isActive =
              tab.href === "/admin"
                ? pathname === "/"
                : tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
                  isActive
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {/* Page Content */}
        {children}
      </div>
    </div>
  );
}
