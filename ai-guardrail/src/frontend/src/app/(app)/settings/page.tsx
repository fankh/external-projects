"use client";

import React, { useEffect, useState } from "react";
import {
  User,
  Palette,
  ShieldCheck,
  Bell,
  Camera,
  Monitor,
  Sun,
  Moon,
  Smartphone,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import type { UserSettings } from "@/types";

type Tab = "profile" | "preferences" | "security" | "notifications";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "preferences", label: "Preferences", icon: Palette },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const defaultSettings: UserSettings = {
  profile: { name: "", email: "", avatarUrl: "" },
  preferences: { theme: "system", language: "en", timezone: "UTC" },
  security: { mfaEnabled: false, activeSessions: [] },
  notifications: {
    emailEnabled: true,
    pushEnabled: false,
    categories: [
      { key: "security", label: "Security Alerts", email: true, push: true },
      { key: "usage", label: "Usage Reports", email: true, push: false },
      { key: "updates", label: "Product Updates", email: true, push: false },
      { key: "tips", label: "Tips & Tutorials", email: false, push: false },
    ],
  },
};

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form fields
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [language, setLanguage] = useState("en");
  const [timezone, setTimezone] = useState("UTC");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaEnabled, setMfaEnabled] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await api.get<UserSettings>("/settings");
        setSettings(data);
        setDisplayName(data.profile.name);
        setEmail(data.profile.email);
        setLanguage(data.preferences.language);
        setTimezone(data.preferences.timezone);
        setMfaEnabled(data.security.mfaEnabled);
      } catch {
        // Use defaults with user data
        if (user) {
          setDisplayName(user.name);
          setEmail(user.email);
        }
      }
      setIsLoading(false);
    };
    fetchSettings();
  }, [user]);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      await api.put("/settings/profile", { name: displayName, email });
    } catch {}
    setIsSaving(false);
  };

  const handleSavePreferences = async () => {
    setIsSaving(true);
    try {
      await api.put("/settings/preferences", { theme, language, timezone });
    } catch {}
    setIsSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) return;
    setIsSaving(true);
    try {
      await api.put("/settings/password", {
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {}
    setIsSaving(false);
  };

  const handleToggleMfa = async () => {
    setIsSaving(true);
    try {
      await api.put("/settings/mfa", { enabled: !mfaEnabled });
      setMfaEnabled(!mfaEnabled);
    } catch {}
    setIsSaving(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and preferences
          </p>
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Tab Nav */}
          <nav className="flex md:flex-col gap-1 md:w-48 shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 rounded-sm px-3 py-2 text-sm font-medium transition-colors hover:bg-accent text-left",
                  activeTab === tab.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground"
                )}
              >
                <tab.icon className="h-4 w-4 shrink-0" />
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Tab Content */}
          <div className="flex-1 space-y-6">
            {/* Profile Tab */}
            {activeTab === "profile" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Profile Information</CardTitle>
                  <CardDescription>
                    Update your display name, email, and avatar
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Avatar */}
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                        {displayName
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .toUpperCase()
                          .slice(0, 2) || "U"}
                      </div>
                      <button className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90">
                        <Camera className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Profile Photo</p>
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG or GIF. Max 2MB.
                      </p>
                    </div>
                  </div>

                  {/* Name */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Display Name</label>
                    <Input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Your name"
                    />
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>

                  <Button onClick={handleSaveProfile} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Preferences Tab */}
            {activeTab === "preferences" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Preferences</CardTitle>
                  <CardDescription>
                    Customize the look and feel of the application
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Theme */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Theme</label>
                    <div className="flex gap-2">
                      {[
                        { value: "light" as const, icon: Sun, label: "Light" },
                        { value: "dark" as const, icon: Moon, label: "Dark" },
                        { value: "system" as const, icon: Monitor, label: "System" },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setTheme(opt.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-sm border px-4 py-2 text-sm transition-colors",
                            theme === opt.value
                              ? "border-primary bg-primary/5 text-primary"
                              : "border-input text-muted-foreground hover:bg-accent"
                          )}
                        >
                          <opt.icon className="h-4 w-4" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="en">English</option>
                      <option value="ko">Korean</option>
                      <option value="ja">Japanese</option>
                      <option value="zh">Chinese</option>
                    </select>
                  </div>

                  {/* Timezone */}
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Timezone</label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="flex h-10 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="UTC">UTC</option>
                      <option value="Asia/Seoul">Asia/Seoul (KST)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                    </select>
                  </div>

                  <Button onClick={handleSavePreferences} disabled={isSaving}>
                    {isSaving ? "Saving..." : "Save Preferences"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Security Tab */}
            {activeTab === "security" && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Change Password</CardTitle>
                    <CardDescription>
                      Update your password to keep your account secure
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Current Password
                      </label>
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">New Password</label>
                      <Input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Enter new password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">
                        Confirm New Password
                      </label>
                      <Input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm new password"
                      />
                    </div>
                    {newPassword &&
                      confirmPassword &&
                      newPassword !== confirmPassword && (
                        <p className="text-sm text-destructive">
                          Passwords do not match
                        </p>
                      )}
                    <Button
                      onClick={handleChangePassword}
                      disabled={
                        isSaving ||
                        !currentPassword ||
                        !newPassword ||
                        newPassword !== confirmPassword
                      }
                    >
                      {isSaving ? "Updating..." : "Update Password"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Multi-Factor Authentication
                    </CardTitle>
                    <CardDescription>
                      Add an extra layer of security to your account
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {mfaEnabled ? "MFA Enabled" : "MFA Disabled"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {mfaEnabled
                            ? "Your account is protected with MFA"
                            : "Enable MFA for enhanced security"}
                        </p>
                      </div>
                      <Button
                        variant={mfaEnabled ? "destructive" : "default"}
                        size="sm"
                        onClick={handleToggleMfa}
                        disabled={isSaving}
                      >
                        {mfaEnabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Active Sessions</CardTitle>
                    <CardDescription>
                      Devices where you are currently logged in
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {(settings.security.activeSessions.length > 0
                        ? settings.security.activeSessions
                        : [
                            {
                              id: "1",
                              device: "Chrome on macOS",
                              lastActive: new Date().toISOString(),
                              current: true,
                            },
                          ]
                      ).map((session) => (
                        <div
                          key={session.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div className="flex items-center gap-3">
                            <Smartphone className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">
                                {session.device}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Last active:{" "}
                                {new Date(session.lastActive).toLocaleString()}
                              </p>
                            </div>
                          </div>
                          {session.current ? (
                            <Badge variant="success">Current</Badge>
                          ) : (
                            <Button variant="ghost" size="sm">
                              <LogOut className="h-3.5 w-3.5 mr-1" />
                              Revoke
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Notifications Tab */}
            {activeTab === "notifications" && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Notification Preferences
                  </CardTitle>
                  <CardDescription>
                    Choose how and when you want to be notified
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Global toggles */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Email Notifications</p>
                        <p className="text-xs text-muted-foreground">
                          Receive notifications via email
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setSettings((s) => ({
                            ...s,
                            notifications: {
                              ...s.notifications,
                              emailEnabled: !s.notifications.emailEnabled,
                            },
                          }))
                        }
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          settings.notifications.emailEnabled
                            ? "bg-primary"
                            : "bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            settings.notifications.emailEnabled
                              ? "translate-x-6"
                              : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Push Notifications</p>
                        <p className="text-xs text-muted-foreground">
                          Receive push notifications in the browser
                        </p>
                      </div>
                      <button
                        onClick={() =>
                          setSettings((s) => ({
                            ...s,
                            notifications: {
                              ...s.notifications,
                              pushEnabled: !s.notifications.pushEnabled,
                            },
                          }))
                        }
                        className={cn(
                          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                          settings.notifications.pushEnabled
                            ? "bg-primary"
                            : "bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                            settings.notifications.pushEnabled
                              ? "translate-x-6"
                              : "translate-x-1"
                          )}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Per-category */}
                  <div>
                    <p className="text-sm font-semibold mb-3">
                      Notification Categories
                    </p>
                    <div className="space-y-3">
                      {settings.notifications.categories.map((cat, idx) => (
                        <div
                          key={cat.key}
                          className="flex items-center justify-between py-2 border-b last:border-0"
                        >
                          <span className="text-sm">{cat.label}</span>
                          <div className="flex items-center gap-4">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={cat.email}
                                onChange={() =>
                                  setSettings((s) => {
                                    const cats = [...s.notifications.categories];
                                    cats[idx] = { ...cats[idx], email: !cats[idx].email };
                                    return {
                                      ...s,
                                      notifications: { ...s.notifications, categories: cats },
                                    };
                                  })
                                }
                                className="rounded border-input"
                              />
                              Email
                            </label>
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={cat.push}
                                onChange={() =>
                                  setSettings((s) => {
                                    const cats = [...s.notifications.categories];
                                    cats[idx] = { ...cats[idx], push: !cats[idx].push };
                                    return {
                                      ...s,
                                      notifications: { ...s.notifications, categories: cats },
                                    };
                                  })
                                }
                                className="rounded border-input"
                              />
                              Push
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={async () => {
                      setIsSaving(true);
                      try {
                        await api.put("/settings/notifications", settings.notifications);
                      } catch {}
                      setIsSaving(false);
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? "Saving..." : "Save Notification Settings"}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
