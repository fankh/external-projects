"use client";

import React, { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface SettingField {
  key: string;
  label: string;
  description?: string;
  type: "number" | "toggle" | "text";
  suffix?: string;
}

interface SystemSettingCardProps {
  title: string;
  description: string;
  settings: SettingField[];
  values: Record<string, unknown>;
  onSave: (values: Record<string, unknown>) => void;
}

export function SystemSettingCard({
  title,
  description,
  settings,
  values,
  onSave,
}: SystemSettingCardProps) {
  const [localValues, setLocalValues] = useState<Record<string, unknown>>(values);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setLocalValues(values);
  }, [values]);

  function handleChange(key: string, value: unknown) {
    setLocalValues((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  function handleSave() {
    onSave(localValues);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings.map((setting) => (
          <div key={setting.key} className="flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{setting.label}</p>
              {setting.description && (
                <p className="text-xs text-muted-foreground">{setting.description}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {setting.type === "toggle" ? (
                <button
                  onClick={() => handleChange(setting.key, !localValues[setting.key])}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    localValues[setting.key] ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm transition-transform ${
                      localValues[setting.key] ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    type={setting.type}
                    value={String(localValues[setting.key] ?? "")}
                    onChange={(e) =>
                      handleChange(
                        setting.key,
                        setting.type === "number" ? Number(e.target.value) : e.target.value
                      )
                    }
                    className="w-24 h-9"
                  />
                  {setting.suffix && (
                    <span className="text-xs text-muted-foreground">{setting.suffix}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="pt-2 border-t">
          <Button onClick={handleSave} size="sm" className="gap-2">
            <Save className="h-4 w-4" />
            {saved ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
