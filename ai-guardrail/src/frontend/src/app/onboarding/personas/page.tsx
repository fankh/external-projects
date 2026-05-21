"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Shield,
  Scale,
  FileText,
  Brain,
  Code2,
  MessageSquare,
  BarChart3,
  BookOpen,
  HeartPulse,
  Landmark,
  GraduationCap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PersonaCard } from "@/components/onboarding/PersonaCard";
import { api } from "@/lib/api";

interface PersonaDef {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
}

const PERSONAS: PersonaDef[] = [
  {
    id: "security-analyst",
    name: "Security Analyst",
    category: "Security",
    description:
      "Analyze threats, review incidents, and provide security recommendations with compliance awareness.",
    icon: <Shield className="h-5 w-5" />,
  },
  {
    id: "legal-advisor",
    name: "Legal Advisor",
    category: "Legal",
    description:
      "Draft contracts, review legal documents, and provide regulatory compliance guidance.",
    icon: <Scale className="h-5 w-5" />,
  },
  {
    id: "technical-writer",
    name: "Technical Writer",
    category: "Content",
    description:
      "Create documentation, user guides, API references, and technical specifications.",
    icon: <FileText className="h-5 w-5" />,
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    category: "Research",
    description:
      "Conduct research, summarize findings, analyze data, and compile literature reviews.",
    icon: <Brain className="h-5 w-5" />,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    category: "Engineering",
    description:
      "Review code for security vulnerabilities, best practices, and optimization opportunities.",
    icon: <Code2 className="h-5 w-5" />,
  },
  {
    id: "customer-support",
    name: "Customer Support",
    category: "Support",
    description:
      "Handle customer inquiries, draft responses, and manage support ticket workflows.",
    icon: <MessageSquare className="h-5 w-5" />,
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    category: "Analytics",
    description:
      "Analyze datasets, generate insights, create visualizations, and build reports.",
    icon: <BarChart3 className="h-5 w-5" />,
  },
  {
    id: "policy-writer",
    name: "Policy Writer",
    category: "Compliance",
    description:
      "Draft organizational policies, compliance documents, and governance frameworks.",
    icon: <BookOpen className="h-5 w-5" />,
  },
  {
    id: "healthcare-assistant",
    name: "Healthcare Assistant",
    category: "Healthcare",
    description:
      "Support clinical documentation, medical research summaries, and patient education materials.",
    icon: <HeartPulse className="h-5 w-5" />,
  },
  {
    id: "finance-analyst",
    name: "Finance Analyst",
    category: "Finance",
    description:
      "Financial modeling, risk assessment, market analysis, and investment research support.",
    icon: <Landmark className="h-5 w-5" />,
  },
  {
    id: "training-designer",
    name: "Training Designer",
    category: "Education",
    description:
      "Design training materials, quizzes, onboarding guides, and educational content.",
    icon: <GraduationCap className="h-5 w-5" />,
  },
  {
    id: "general-assistant",
    name: "General Assistant",
    category: "General",
    description:
      "Versatile AI assistant for everyday tasks including writing, brainstorming, and problem solving.",
    icon: <Sparkles className="h-5 w-5" />,
  },
];

export default function PersonaSelectionPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const togglePersona = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    if (selected.size === 0) {
      setError("Please select at least one persona");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      await api.post("/onboarding/personas", {
        selectedPersonas: Array.from(selected),
      });

      router.push("/onboarding/complete");
    } catch (err) {
      setError((err as Error).message || "Failed to save persona preferences");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Choose your AI personas</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select the personas you want to use. You can always change these later.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {error && (
            <div className="rounded-sm bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Selected count */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selected.size} persona{selected.size !== 1 ? "s" : ""} selected
            </span>
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          {/* Persona grid */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PERSONAS.map((persona) => (
              <PersonaCard
                key={persona.id}
                id={persona.id}
                name={persona.name}
                category={persona.category}
                description={persona.description}
                icon={persona.icon}
                selected={selected.has(persona.id)}
                onToggle={togglePersona}
              />
            ))}
          </div>

          <Button
            className="w-full"
            onClick={handleContinue}
            disabled={isLoading || selected.size === 0}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </div>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
