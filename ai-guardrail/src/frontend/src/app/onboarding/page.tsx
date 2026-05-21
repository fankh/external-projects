"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface OnboardingStatus {
  currentStep: number;
  onboardingComplete: boolean;
}

const STEP_ROUTES: Record<number, string> = {
  1: "/onboarding/company",
  2: "/onboarding/company",
  3: "/onboarding/team",
  4: "/onboarding/personas",
  5: "/onboarding/complete",
};

export default function OnboardingPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.push("/login");
      return;
    }

    api
      .get<OnboardingStatus>("/onboarding/status")
      .then((status) => {
        if (status.onboardingComplete) {
          router.push("/chat");
        } else {
          const route = STEP_ROUTES[status.currentStep] || "/onboarding/company";
          router.push(route);
        }
      })
      .catch(() => {
        // Default to company step
        router.push("/onboarding/company");
      });
  }, [router]);

  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}
