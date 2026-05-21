"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield } from "lucide-react";
import { ProgressStepper } from "@/components/onboarding/ProgressStepper";
import { api } from "@/lib/api";

interface OnboardingStatus {
  currentStep: number;
  emailVerified: boolean;
  companyCompleted: boolean;
  teamInvited: boolean;
  personasSelected: boolean;
  onboardingComplete: boolean;
}

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(2); // default to step 2 (account already created)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    // Fetch onboarding status
    api
      .get<OnboardingStatus>("/onboarding/status")
      .then((status) => {
        setCurrentStep(status.currentStep);
        if (status.onboardingComplete) {
          router.push("/chat");
        }
      })
      .catch(() => {
        // If status fetch fails, stay on default step
      })
      .finally(() => {
        setMounted(true);
      });
  }, [router]);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <span className="text-lg font-bold">KYRA</span>
          </div>
          <span className="text-sm text-muted-foreground">
            Setting up your workspace
          </span>
        </div>
      </header>

      {/* Progress stepper */}
      <div className="mx-auto max-w-2xl px-6 pt-8">
        <ProgressStepper currentStep={currentStep} />
      </div>

      {/* Content */}
      <div className="mx-auto max-w-2xl px-6 py-8">{children}</div>
    </div>
  );
}
