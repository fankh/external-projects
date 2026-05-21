"use client";

import React, { useEffect } from "react";
import { useAdminStore } from "@/stores/admin-store";
import { SystemSettingCard, type SettingField } from "@/components/admin/SystemSettingCard";

const generalSettings: SettingField[] = [
  {
    key: "sessionTimeout",
    label: "Session Timeout",
    description: "Auto-logout after inactivity",
    type: "number",
    suffix: "minutes",
  },
  {
    key: "maxConcurrentSessions",
    label: "Max Concurrent Sessions",
    description: "Maximum simultaneous sessions per user",
    type: "number",
  },
  {
    key: "maxFileUploadSize",
    label: "Max File Upload Size",
    description: "Maximum file size for document uploads",
    type: "number",
    suffix: "MB",
  },
];

const featureSettings: SettingField[] = [
  {
    key: "ragEnabled",
    label: "RAG Pipeline",
    description: "Enable Retrieval-Augmented Generation for document-based answers",
    type: "toggle",
  },
  {
    key: "memoryEnabled",
    label: "Conversation Memory",
    description: "Enable persistent memory across conversations",
    type: "toggle",
  },
  {
    key: "streamingEnabled",
    label: "Streaming Responses",
    description: "Stream AI responses token by token",
    type: "toggle",
  },
  {
    key: "multiModalEnabled",
    label: "Multi-Modal Input",
    description: "Allow image and file inputs in conversations",
    type: "toggle",
  },
];

const securitySettings: SettingField[] = [
  {
    key: "maxLoginAttempts",
    label: "Max Login Attempts",
    description: "Lock account after this many failed attempts",
    type: "number",
  },
  {
    key: "lockoutDuration",
    label: "Lockout Duration",
    description: "How long accounts stay locked after max failed attempts",
    type: "number",
    suffix: "minutes",
  },
  {
    key: "mfaRequired",
    label: "Require MFA",
    description: "Require multi-factor authentication for all users",
    type: "toggle",
  },
];

export default function SystemPage() {
  const { systemSettings, settingsLoading, fetchSystemSettings, updateSettings } =
    useAdminStore();

  useEffect(() => {
    fetchSystemSettings();
  }, [fetchSystemSettings]);

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SystemSettingCard
        title="General Settings"
        description="Configure session management and upload limits"
        settings={generalSettings}
        values={systemSettings.general}
        onSave={(values) => updateSettings("general", values)}
      />

      <SystemSettingCard
        title="Feature Toggles"
        description="Enable or disable platform features"
        settings={featureSettings}
        values={systemSettings.features}
        onSave={(values) => updateSettings("features", values)}
      />

      <SystemSettingCard
        title="Security Settings"
        description="Configure authentication and access control policies"
        settings={securitySettings}
        values={systemSettings.security}
        onSave={(values) => updateSettings("security", values)}
      />
    </div>
  );
}
