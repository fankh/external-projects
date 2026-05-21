"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, X, ChevronDown, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api";

interface TeamMember {
  id: string;
  email: string;
  role: string;
}

const ROLES = [
  { value: "user", label: "User" },
  { value: "manager", label: "Manager" },
  { value: "admin", label: "Admin" },
];

export default function TeamInvitePage() {
  const router = useRouter();
  const [members, setMembers] = useState<TeamMember[]>([
    { id: "1", email: "", role: "user" },
  ]);
  const [personalMessage, setPersonalMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const addMember = () => {
    setMembers((prev) => [
      ...prev,
      { id: Date.now().toString(), email: "", role: "user" },
    ]);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  const updateMemberEmail = (id: string, email: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, email } : m))
    );
  };

  const updateMemberRole = (id: string, role: string) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === id ? { ...m, role } : m))
    );
  };

  const handleInvite = async () => {
    setError("");

    const validEmails = members
      .map((m) => m.email.trim())
      .filter((e) => e.length > 0);

    if (validEmails.length === 0) {
      setError("Please enter at least one email address");
      return;
    }

    // Basic email validation
    const invalidEmails = validEmails.filter(
      (e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
    );
    if (invalidEmails.length > 0) {
      setError(`Invalid email: ${invalidEmails.join(", ")}`);
      return;
    }

    setIsLoading(true);

    try {
      await api.post("/onboarding/invite-team", {
        emails: validEmails,
        role: members[0]?.role || "user",
        personalMessage: personalMessage || undefined,
      });

      router.push("/onboarding/personas");
    } catch (err) {
      setError((err as Error).message || "Failed to send invitations");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSkip = async () => {
    // Mark team step as completed but skipped
    try {
      await api.post("/onboarding/invite-team", {
        emails: [],
        role: "user",
      });
    } catch {
      // Ignore errors on skip
    }
    router.push("/onboarding/personas");
  };

  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Users className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Invite your team</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Collaborate with your team members on KYRA
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {error && (
            <div className="rounded-sm bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Email list */}
          <div className="space-y-3">
            {members.map((member, index) => (
              <div key={member.id} className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="email"
                    placeholder="colleague@company.com"
                    value={member.email}
                    onChange={(e) =>
                      updateMemberEmail(member.id, e.target.value)
                    }
                    disabled={isLoading}
                    className="pl-9"
                  />
                </div>

                {/* Role selector */}
                <div className="relative w-28 shrink-0">
                  <select
                    value={member.role}
                    onChange={(e) =>
                      updateMemberRole(member.id, e.target.value)
                    }
                    disabled={isLoading}
                    className="flex h-10 w-full appearance-none rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                </div>

                {/* Remove button */}
                {members.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMember(member.id)}
                    disabled={isLoading}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border border-input text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}

            <button
              type="button"
              onClick={addMember}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-muted-foreground/30 py-2.5 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              Add another
            </button>
          </div>

          {/* Personal message */}
          <div className="space-y-2">
            <label
              htmlFor="message"
              className="text-sm font-medium leading-none"
            >
              Personal Message{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <textarea
              id="message"
              placeholder="Hey team, I set up KYRA AI Guardrail for us..."
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="flex w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSkip}
              disabled={isLoading}
            >
              Skip for now
            </Button>
            <Button
              className="flex-1"
              onClick={handleInvite}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Sending...
                </div>
              ) : (
                "Send Invitations"
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
