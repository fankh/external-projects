"use client";

import React from "react";
import {
  UserPlus,
  Building2,
  Users,
  Sparkles,
  CheckCircle2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  label: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  { label: "Account", icon: <UserPlus className="h-5 w-5" /> },
  { label: "Company", icon: <Building2 className="h-5 w-5" /> },
  { label: "Team", icon: <Users className="h-5 w-5" /> },
  { label: "Personas", icon: <Sparkles className="h-5 w-5" /> },
  { label: "Complete", icon: <CheckCircle2 className="h-5 w-5" /> },
];

interface ProgressStepperProps {
  currentStep: number; // 1-5
}

export function ProgressStepper({ currentStep }: ProgressStepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;

          return (
            <React.Fragment key={step.label}>
              {/* Step indicator */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-sm border-2 transition-all duration-200",
                    isCompleted &&
                      "border-primary bg-primary text-primary-foreground",
                    isCurrent &&
                      "border-primary bg-primary/10 text-primary",
                    !isCompleted &&
                      !isCurrent &&
                      "border-muted-foreground/30 text-muted-foreground/50"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    step.icon
                  )}
                </div>
                <span
                  className={cn(
                    "hidden text-xs font-medium sm:block",
                    isCompleted && "text-primary",
                    isCurrent && "text-primary",
                    !isCompleted && !isCurrent && "text-muted-foreground/50"
                  )}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    "mx-2 h-0.5 flex-1 rounded-full transition-all duration-200",
                    stepNumber < currentStep
                      ? "bg-primary"
                      : "bg-muted-foreground/20"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
