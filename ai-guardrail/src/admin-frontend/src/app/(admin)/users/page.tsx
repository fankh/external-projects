"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Search, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { UserTable } from "@/components/admin/UserTable";
import { useAdminStore, type AdminUser } from "@/stores/admin-store";

export default function UsersPage() {
  const {
    users,
    usersLoading,
    fetchUsers,
    updateUserRole,
    suspendUser,
    activateUser,
    addUser,
  } = useAdminStore();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [newUserForm, setNewUserForm] = useState({
    name: "",
    email: "",
    role: "user" as "admin" | "user" | "viewer",
    department: "",
  });
  const [editRole, setEditRole] = useState<"admin" | "user" | "viewer">("user");

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const departments = useMemo(
    () => Array.from(new Set(users.map((u) => u.department))).sort(),
    [users]
  );

  const filtered = useMemo(() => {
    return users.filter((u) => {
      const matchSearch =
        !search ||
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchRole = roleFilter === "all" || u.role === roleFilter;
      const matchStatus = statusFilter === "all" || u.status === statusFilter;
      const matchDept = deptFilter === "all" || u.department === deptFilter;
      return matchSearch && matchRole && matchStatus && matchDept;
    });
  }, [users, search, roleFilter, statusFilter, deptFilter]);

  function handleEdit(user: AdminUser) {
    setEditingUser(user);
    setEditRole(user.role);
    setShowEditDialog(true);
  }

  function handleSaveRole() {
    if (editingUser) {
      updateUserRole(editingUser.id, editRole);
      setShowEditDialog(false);
      setEditingUser(null);
    }
  }

  function handleAddUser() {
    if (newUserForm.name && newUserForm.email) {
      addUser(newUserForm);
      setShowAddDialog(false);
      setNewUserForm({ name: "", email: "", role: "user", department: "" });
    }
  }

  function handleResetPassword(userId: string) {
    // Placeholder - would call API
    alert(`Password reset email sent for user ${userId}`);
  }

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-10 rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="all">All Roles</option>
              <option value="admin">Admin</option>
              <option value="user">User</option>
              <option value="viewer">Viewer</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="pending">Pending</option>
            </select>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-10 rounded-sm border border-input bg-background px-3 text-sm"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <Button onClick={() => setShowAddDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add User
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Users ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <UserTable
            users={filtered}
            onEdit={handleEdit}
            onSuspend={suspendUser}
            onActivate={activateUser}
            onResetPassword={handleResetPassword}
            loading={usersLoading}
          />
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account. They will receive an invitation email.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                placeholder="Full name"
                value={newUserForm.name}
                onChange={(e) =>
                  setNewUserForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                placeholder="email@company.com"
                value={newUserForm.email}
                onChange={(e) =>
                  setNewUserForm((f) => ({ ...f, email: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select
                value={newUserForm.role}
                onChange={(e) =>
                  setNewUserForm((f) => ({
                    ...f,
                    role: e.target.value as "admin" | "user" | "viewer",
                  }))
                }
                className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Department</label>
              <select
                value={newUserForm.department}
                onChange={(e) =>
                  setNewUserForm((f) => ({ ...f, department: e.target.value }))
                }
                className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
              >
                <option value="">Select department</option>
                <option value="IT">IT</option>
                <option value="Engineering">Engineering</option>
                <option value="Marketing">Marketing</option>
                <option value="Sales">Sales</option>
                <option value="Legal">Legal</option>
                <option value="HR">HR</option>
                <option value="Finance">Finance</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddUser}>Create User</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Role Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User Role</DialogTitle>
            <DialogDescription>
              Change the role for {editingUser?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <select
                value={editRole}
                onChange={(e) =>
                  setEditRole(e.target.value as "admin" | "user" | "viewer")
                }
                className="w-full h-10 rounded-sm border border-input bg-background px-3 text-sm"
              >
                <option value="admin">Admin</option>
                <option value="user">User</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveRole}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
