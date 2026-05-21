"use client";

import React, { useEffect, useState } from "react";
import {
  Shield,
  Brain,
  Code,
  BookOpen,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useChatStore } from "@/stores/chat-store";
import { api } from "@/lib/api";
import type { Persona } from "@/types";

const iconMap: Record<string, React.ElementType> = {
  shield: Shield,
  brain: Brain,
  code: Code,
  book: BookOpen,
  help: HelpCircle,
};

const defaultPersonas: Persona[] = [
  {
    id: "default",
    name: "General Assistant",
    description: "Versatile AI assistant for general queries",
    icon: "brain",
    category: "General",
    isDefault: true,
  },
  {
    id: "security",
    name: "Security Analyst",
    description: "Specialized in cybersecurity and threat analysis",
    icon: "shield",
    category: "Security",
  },
  {
    id: "developer",
    name: "Code Assistant",
    description: "Help with coding, debugging, and architecture",
    icon: "code",
    category: "Development",
  },
  {
    id: "researcher",
    name: "Research Assistant",
    description: "Deep analysis and literature review support",
    icon: "book",
    category: "Research",
  },
];

export function PersonaSelector() {
  const { selectedPersonaId, setSelectedPersonaId } = useChatStore();
  const [personas, setPersonas] = useState<Persona[]>(defaultPersonas);

  useEffect(() => {
    api
      .get<Persona[]>("/personas")
      .then((data) => {
        if (data && data.length > 0) setPersonas(data);
      })
      .catch(() => {});
  }, []);

  const selectedPersona =
    personas.find((p) => p.id === selectedPersonaId) || personas[0];
  const Icon = iconMap[selectedPersona.icon] || HelpCircle;

  // Group by category
  const grouped = personas.reduce<Record<string, Persona[]>>((acc, p) => {
    const cat = p.category || "Other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(p);
    return acc;
  }, {});

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between text-left h-auto py-2.5"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Icon className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {selectedPersona.name}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {selectedPersona.description}
              </p>
            </div>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 ml-2 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        {Object.entries(grouped).map(([category, items], catIdx) => (
          <React.Fragment key={category}>
            {catIdx > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground">{category}</DropdownMenuLabel>
            {items.map((persona) => {
              const PIcon = iconMap[persona.icon] || HelpCircle;
              return (
                <DropdownMenuItem
                  key={persona.id}
                  onClick={() => setSelectedPersonaId(persona.id)}
                  className="flex items-start gap-2 py-2"
                >
                  <PIcon className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{persona.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {persona.description}
                    </p>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
