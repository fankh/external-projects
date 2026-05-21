"use client";

import React, { useState } from "react";
import {
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  UserCog,
  Ban,
  CheckCircle,
  KeyRound,
  Activity,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminUser } from "@/stores/admin-store";

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  admin: "default",
  user: "secondary",
  viewer: "outline",
};

const statusBadgeVariant: Record<string, "success" | "destructive" | "warning"> = {
  active: "success",
  suspended: "destructive",
  pending: "warning",
};

interface UserTableProps {
  users: AdminUser[];
  onEdit: (user: AdminUser) => void;
  onSuspend: (userId: string) => void;
  onActivate: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  loading?: boolean;
}

const PAGE_SIZE = 10;

export function UserTable({
  users,
  onEdit,
  onSuspend,
  onActivate,
  onResetPassword,
  loading,
}: UserTableProps) {
  const [page, setPage] = useState(0);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  const paged = users.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function formatDate(dateStr: string | null) {
    if (!dateStr) return "Never";
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Department</th>
              <th>Status</th>
              <th>Last Login</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((user) => (
              <tr key={user.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="py-3 font-medium">{user.name}</td>
                <td className="py-3 text-muted-foreground">{user.email}</td>
                <td className="py-3">
                  <Badge variant={roleBadgeVariant[user.role] ?? "outline"}>
                    {user.role}
                  </Badge>
                </td>
                <td className="py-3 text-muted-foreground">{user.department}</td>
                <td className="py-3">
                  <Badge variant={statusBadgeVariant[user.status] ?? "outline"}>
                    {user.status}
                  </Badge>
                </td>
                <td className="py-3 text-muted-foreground">{formatDate(user.lastLogin)}</td>
                <td className="py-3 text-right relative">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setOpenMenu(openMenu === user.id ? null : user.id)}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                  {openMenu === user.id && (
                    <div className="absolute right-0 top-full z-50 w-48 rounded-sm border bg-popover p-1 shadow-md">
                      <button
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => { onEdit(user); setOpenMenu(null); }}
                      >
                        <UserCog className="h-4 w-4" /> Edit Role
                      </button>
                      {user.status === "active" ? (
                        <button
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-destructive"
                          onClick={() => { onSuspend(user.id); setOpenMenu(null); }}
                        >
                          <Ban className="h-4 w-4" /> Suspend
                        </button>
                      ) : (
                        <button
                          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent text-[hsl(var(--success))]"
                          onClick={() => { onActivate(user.id); setOpenMenu(null); }}
                        >
                          <CheckCircle className="h-4 w-4" /> Activate
                        </button>
                      )}
                      <button
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => { onResetPassword(user.id); setOpenMenu(null); }}
                      >
                        <KeyRound className="h-4 w-4" /> Reset Password
                      </button>
                      <button
                        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => setOpenMenu(null)}
                      >
                        <Activity className="h-4 w-4" /> View Activity
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, users.length)} of {users.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page - 1)}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(page + 1)}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
