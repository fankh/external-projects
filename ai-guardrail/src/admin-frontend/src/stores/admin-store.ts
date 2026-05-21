import { create } from "zustand";
import { api } from "@/lib/api";
import type { User } from "@/types";

export interface AdminUser extends User {
  department: string;
  status: "active" | "suspended" | "pending";
  lastLogin: string | null;
}

export interface SecurityEvent {
  id: string;
  type: "dlp_violation" | "auth_failure" | "anomaly" | "policy_breach" | "data_exfil";
  severity: "critical" | "high" | "medium" | "low";
  userId: string;
  userName: string;
  description: string;
  status: "open" | "reviewed" | "dismissed";
  createdAt: string;
}

export interface DlpPattern {
  id: string;
  name: string;
  category: string;
  pattern: string;
  severity: "critical" | "high" | "medium" | "low";
  action: "block" | "warn" | "log";
  active: boolean;
  createdAt: string;
}

export interface SystemSettings {
  general: {
    sessionTimeout: number;
    maxConcurrentSessions: number;
    maxFileUploadSize: number;
  };
  features: {
    ragEnabled: boolean;
    memoryEnabled: boolean;
    streamingEnabled: boolean;
    multiModalEnabled: boolean;
  };
  security: {
    maxLoginAttempts: number;
    lockoutDuration: number;
    mfaRequired: boolean;
  };
}

export interface Report {
  id: string;
  type: "usage" | "security" | "compliance" | "team_summary";
  scope: string;
  period: string;
  format: "pdf" | "xlsx" | "json";
  status: "generating" | "ready" | "failed";
  createdAt: string;
  downloadUrl?: string;
}

interface AdminState {
  // Users
  users: AdminUser[];
  usersLoading: boolean;
  fetchUsers: () => Promise<void>;
  updateUserRole: (userId: string, role: User["role"]) => Promise<void>;
  suspendUser: (userId: string) => Promise<void>;
  activateUser: (userId: string) => Promise<void>;
  addUser: (user: { name: string; email: string; role: User["role"]; department: string }) => Promise<void>;

  // Security Events
  securityEvents: SecurityEvent[];
  eventsLoading: boolean;
  fetchSecurityEvents: () => Promise<void>;
  reviewEvent: (eventId: string) => Promise<void>;

  // DLP Patterns
  dlpPatterns: DlpPattern[];
  patternsLoading: boolean;
  fetchDlpPatterns: () => Promise<void>;
  togglePattern: (patternId: string) => Promise<void>;
  createPattern: (pattern: Omit<DlpPattern, "id" | "createdAt">) => Promise<void>;

  // System Settings
  systemSettings: SystemSettings;
  settingsLoading: boolean;
  fetchSystemSettings: () => Promise<void>;
  updateSettings: (section: keyof SystemSettings, values: Record<string, unknown>) => Promise<void>;

  // Reports
  reports: Report[];
  reportsLoading: boolean;
  fetchReports: () => Promise<void>;
  generateReport: (params: { type: string; startDate: string; endDate: string; format: string }) => Promise<void>;
}

// Demo data
const demoUsers: AdminUser[] = [
  { id: "1", name: "Admin User", email: "admin@company.com", role: "admin", department: "IT", status: "active", lastLogin: "2026-04-13T09:15:00Z", createdAt: "2025-01-15T00:00:00Z" },
  { id: "2", name: "Sarah Kim", email: "sarah.kim@company.com", role: "user", department: "Engineering", status: "active", lastLogin: "2026-04-13T08:30:00Z", createdAt: "2025-03-10T00:00:00Z" },
  { id: "3", name: "James Chen", email: "james.chen@company.com", role: "user", department: "Marketing", status: "active", lastLogin: "2026-04-12T14:20:00Z", createdAt: "2025-06-01T00:00:00Z" },
  { id: "4", name: "Emily Park", email: "emily.park@company.com", role: "viewer", department: "Legal", status: "suspended", lastLogin: "2026-04-10T11:00:00Z", createdAt: "2025-08-20T00:00:00Z" },
  { id: "5", name: "David Lee", email: "david.lee@company.com", role: "user", department: "Engineering", status: "active", lastLogin: "2026-04-13T07:45:00Z", createdAt: "2025-09-15T00:00:00Z" },
  { id: "6", name: "Lisa Wang", email: "lisa.wang@company.com", role: "admin", department: "IT", status: "active", lastLogin: "2026-04-13T10:00:00Z", createdAt: "2025-02-01T00:00:00Z" },
  { id: "7", name: "Michael Choi", email: "michael.choi@company.com", role: "user", department: "Sales", status: "pending", lastLogin: null, createdAt: "2026-04-12T00:00:00Z" },
];

const demoEvents: SecurityEvent[] = [
  { id: "e1", type: "dlp_violation", severity: "critical", userId: "3", userName: "James Chen", description: "Attempted to export customer PII data via chat", status: "open", createdAt: "2026-04-13T10:30:00Z" },
  { id: "e2", type: "auth_failure", severity: "high", userId: "4", userName: "Emily Park", description: "5 consecutive failed login attempts from unknown IP", status: "open", createdAt: "2026-04-13T09:15:00Z" },
  { id: "e3", type: "anomaly", severity: "medium", userId: "2", userName: "Sarah Kim", description: "Unusual query volume spike detected (3x normal)", status: "reviewed", createdAt: "2026-04-13T08:00:00Z" },
  { id: "e4", type: "policy_breach", severity: "high", userId: "5", userName: "David Lee", description: "Attempted to access restricted document collection", status: "open", createdAt: "2026-04-12T16:45:00Z" },
  { id: "e5", type: "data_exfil", severity: "critical", userId: "3", userName: "James Chen", description: "Large data extraction pattern detected in conversation", status: "open", createdAt: "2026-04-12T14:20:00Z" },
  { id: "e6", type: "auth_failure", severity: "low", userId: "7", userName: "Michael Choi", description: "Single failed login with incorrect password", status: "dismissed", createdAt: "2026-04-12T11:00:00Z" },
];

const demoPatterns: DlpPattern[] = [
  { id: "p1", name: "Credit Card Numbers", category: "PII", pattern: "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b", severity: "critical", action: "block", active: true, createdAt: "2025-01-01T00:00:00Z" },
  { id: "p2", name: "Social Security Numbers", category: "PII", pattern: "\\b\\d{3}-\\d{2}-\\d{4}\\b", severity: "critical", action: "block", active: true, createdAt: "2025-01-01T00:00:00Z" },
  { id: "p3", name: "Email Addresses", category: "Contact", pattern: "[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}", severity: "medium", action: "warn", active: true, createdAt: "2025-02-15T00:00:00Z" },
  { id: "p4", name: "Internal Project Codes", category: "Business", pattern: "PRJ-\\d{4,6}", severity: "high", action: "warn", active: false, createdAt: "2025-03-20T00:00:00Z" },
  { id: "p5", name: "API Keys", category: "Secrets", pattern: "(sk|pk)_(live|test)_[a-zA-Z0-9]{24,}", severity: "critical", action: "block", active: true, createdAt: "2025-04-10T00:00:00Z" },
  { id: "p6", name: "Phone Numbers", category: "PII", pattern: "\\b\\d{3}[-.\\s]?\\d{3,4}[-.\\s]?\\d{4}\\b", severity: "low", action: "log", active: true, createdAt: "2025-05-01T00:00:00Z" },
];

const defaultSettings: SystemSettings = {
  general: {
    sessionTimeout: 30,
    maxConcurrentSessions: 3,
    maxFileUploadSize: 50,
  },
  features: {
    ragEnabled: true,
    memoryEnabled: true,
    streamingEnabled: true,
    multiModalEnabled: false,
  },
  security: {
    maxLoginAttempts: 5,
    lockoutDuration: 15,
    mfaRequired: false,
  },
};

const demoReports: Report[] = [
  { id: "r1", type: "usage", scope: "All Users", period: "2026-03-01 - 2026-03-31", format: "pdf", status: "ready", createdAt: "2026-04-01T00:00:00Z", downloadUrl: "#" },
  { id: "r2", type: "security", scope: "All Users", period: "2026-03-01 - 2026-03-31", format: "pdf", status: "ready", createdAt: "2026-04-01T00:00:00Z", downloadUrl: "#" },
  { id: "r3", type: "compliance", scope: "Engineering", period: "2026-Q1", format: "xlsx", status: "ready", createdAt: "2026-04-02T00:00:00Z", downloadUrl: "#" },
  { id: "r4", type: "team_summary", scope: "Marketing", period: "2026-04-01 - 2026-04-13", format: "json", status: "generating", createdAt: "2026-04-13T08:00:00Z" },
];

export const useAdminStore = create<AdminState>((set, get) => ({
  // Users
  users: [],
  usersLoading: false,
  fetchUsers: async () => {
    set({ usersLoading: true });
    try {
      const data = await api.get<AdminUser[]>("/admin/users");
      set({ users: data, usersLoading: false });
    } catch {
      set({ users: demoUsers, usersLoading: false });
    }
  },
  updateUserRole: async (userId, role) => {
    try {
      await api.put(`/admin/users/${userId}/role`, { role });
    } catch {}
    set({
      users: get().users.map((u) => (u.id === userId ? { ...u, role } : u)),
    });
  },
  suspendUser: async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/suspend`);
    } catch {}
    set({
      users: get().users.map((u) => (u.id === userId ? { ...u, status: "suspended" as const } : u)),
    });
  },
  activateUser: async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/activate`);
    } catch {}
    set({
      users: get().users.map((u) => (u.id === userId ? { ...u, status: "active" as const } : u)),
    });
  },
  addUser: async (userData) => {
    try {
      const newUser = await api.post<AdminUser>("/admin/users", userData);
      set({ users: [...get().users, newUser] });
    } catch {
      const newUser: AdminUser = {
        id: `u${Date.now()}`,
        ...userData,
        status: "pending",
        lastLogin: null,
        createdAt: new Date().toISOString(),
      };
      set({ users: [...get().users, newUser] });
    }
  },

  // Security Events
  securityEvents: [],
  eventsLoading: false,
  fetchSecurityEvents: async () => {
    set({ eventsLoading: true });
    try {
      const data = await api.get<SecurityEvent[]>("/admin/security/events");
      set({ securityEvents: data, eventsLoading: false });
    } catch {
      set({ securityEvents: demoEvents, eventsLoading: false });
    }
  },
  reviewEvent: async (eventId) => {
    try {
      await api.post(`/admin/security/events/${eventId}/review`);
    } catch {}
    set({
      securityEvents: get().securityEvents.map((e) =>
        e.id === eventId ? { ...e, status: "reviewed" as const } : e
      ),
    });
  },

  // DLP Patterns
  dlpPatterns: [],
  patternsLoading: false,
  fetchDlpPatterns: async () => {
    set({ patternsLoading: true });
    try {
      const data = await api.get<DlpPattern[]>("/admin/security/dlp-patterns");
      set({ dlpPatterns: data, patternsLoading: false });
    } catch {
      set({ dlpPatterns: demoPatterns, patternsLoading: false });
    }
  },
  togglePattern: async (patternId) => {
    const pattern = get().dlpPatterns.find((p) => p.id === patternId);
    if (!pattern) return;
    try {
      await api.put(`/admin/security/dlp-patterns/${patternId}`, { active: !pattern.active });
    } catch {}
    set({
      dlpPatterns: get().dlpPatterns.map((p) =>
        p.id === patternId ? { ...p, active: !p.active } : p
      ),
    });
  },
  createPattern: async (pattern) => {
    try {
      const newPattern = await api.post<DlpPattern>("/admin/security/dlp-patterns", pattern);
      set({ dlpPatterns: [...get().dlpPatterns, newPattern] });
    } catch {
      const newPattern: DlpPattern = {
        id: `p${Date.now()}`,
        ...pattern,
        createdAt: new Date().toISOString(),
      };
      set({ dlpPatterns: [...get().dlpPatterns, newPattern] });
    }
  },

  // System Settings
  systemSettings: defaultSettings,
  settingsLoading: false,
  fetchSystemSettings: async () => {
    set({ settingsLoading: true });
    try {
      const data = await api.get<SystemSettings>("/admin/system/settings");
      set({ systemSettings: data, settingsLoading: false });
    } catch {
      set({ systemSettings: defaultSettings, settingsLoading: false });
    }
  },
  updateSettings: async (section, values) => {
    const current = get().systemSettings;
    const updated = {
      ...current,
      [section]: { ...current[section], ...values },
    };
    try {
      await api.put("/admin/system/settings", updated);
    } catch {}
    set({ systemSettings: updated });
  },

  // Reports
  reports: [],
  reportsLoading: false,
  fetchReports: async () => {
    set({ reportsLoading: true });
    try {
      const data = await api.get<Report[]>("/admin/reports");
      set({ reports: data, reportsLoading: false });
    } catch {
      set({ reports: demoReports, reportsLoading: false });
    }
  },
  generateReport: async (params) => {
    const newReport: Report = {
      id: `r${Date.now()}`,
      type: params.type as Report["type"],
      scope: "All Users",
      period: `${params.startDate} - ${params.endDate}`,
      format: params.format as Report["format"],
      status: "generating",
      createdAt: new Date().toISOString(),
    };
    set({ reports: [newReport, ...get().reports] });
    try {
      await api.post("/admin/reports/generate", params);
    } catch {}
    // Simulate generation completion
    setTimeout(() => {
      set({
        reports: get().reports.map((r) =>
          r.id === newReport.id ? { ...r, status: "ready" as const, downloadUrl: "#" } : r
        ),
      });
    }, 3000);
  },
}));
