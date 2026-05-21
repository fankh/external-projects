"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Users, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

interface OnboardingStatus {
  currentStep: number;
  teamMembersInvited: number;
  selectedPersonas: string[];
  onboardingComplete: boolean;
}

function ConfettiDot({
  delay,
  left,
  color,
}: {
  delay: number;
  left: number;
  color: string;
}) {
  return (
    <div
      className="absolute w-2 h-2 rounded-full animate-bounce"
      style={{
        left: `${left}%`,
        top: "-10px",
        backgroundColor: color,
        animationDelay: `${delay}ms`,
        animationDuration: "1.5s",
      }}
    />
  );
}

const CONFETTI_COLORS = [
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f59e0b",
  "#10b981",
  "#06b6d4",
];

export default function CompletePage() {
  const router = useRouter();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [showConfetti, setShowConfetti] = useState(true);

  const completeAndFetch = useCallback(async () => {
    try {
      // Mark onboarding as complete
      await api.post("/onboarding/complete");

      // Fetch final status
      const data = await api.get<OnboardingStatus>("/onboarding/status");
      setStatus(data);
    } catch {
      // Set fallback status
      setStatus({
        currentStep: 5,
        teamMembersInvited: 0,
        selectedPersonas: [],
        onboardingComplete: true,
      });
    }
  }, []);

  useEffect(() => {
    completeAndFetch();

    // Hide confetti after 4 seconds
    const timer = setTimeout(() => setShowConfetti(false), 4000);
    return () => clearTimeout(timer);
  }, [completeAndFetch]);

  const handleStart = () => {
    router.push("/chat");
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="relative pt-12 pb-8">
        {/* Confetti animation */}
        {showConfetti && (
          <div className="absolute inset-x-0 top-0 h-20 overflow-hidden">
            {Array.from({ length: 20 }).map((_, i) => (
              <ConfettiDot
                key={i}
                delay={i * 100}
                left={Math.random() * 100}
                color={CONFETTI_COLORS[i % CONFETTI_COLORS.length]}
              />
            ))}
          </div>
        )}

        <div className="flex flex-col items-center text-center space-y-6">
          {/* Success icon with ring animation */}
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-[hsl(var(--success))]/20 animate-ping" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--success))]/10">
              <CheckCircle2 className="h-10 w-10 text-[hsl(var(--success))]" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Your workspace is ready!</h2>
            <p className="text-muted-foreground max-w-sm">
              You have successfully set up KYRA AI Guardrail. Start exploring
              your AI-powered workspace.
            </p>
          </div>

          {/* Quick stats */}
          <div className="flex gap-6 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-[hsl(var(--info))]/10">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold">
                  {status?.teamMembersInvited ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Team members invited
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-purple-500/10">
                <Sparkles className="h-4 w-4 text-purple-500" />
              </div>
              <div className="text-left">
                <p className="text-lg font-bold">
                  {status?.selectedPersonas?.length ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">
                  Personas selected
                </p>
              </div>
            </div>
          </div>

          {/* CTA */}
          <Button size="lg" className="gap-2" onClick={handleStart}>
            Start Using KYRA
            <ArrowRight className="h-4 w-4" />
          </Button>

          <p className="text-xs text-muted-foreground">
            You can customize your settings anytime from the dashboard
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
