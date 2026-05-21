"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { api } from "@/lib/api";

const INDUSTRIES = [
  "Technology",
  "Finance",
  "Healthcare",
  "Legal",
  "Government",
  "Education",
  "Other",
];

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-500", "500+"];

export default function CompanyProfilePage() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [companySize, setCompanySize] = useState("");
  const [primaryUseCase, setPrimaryUseCase] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await api.post("/onboarding/company", {
        companyName: companyName || undefined,
        industry: industry || undefined,
        companySize: companySize || undefined,
        primaryUseCase: primaryUseCase || undefined,
      });

      router.push("/onboarding/team");
    } catch (err) {
      setError((err as Error).message || "Failed to save company profile");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Tell us about your company</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This helps us customize your experience
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="rounded-sm bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Company Name */}
          <div className="space-y-2">
            <label
              htmlFor="companyName"
              className="text-sm font-medium leading-none"
            >
              Company Name
            </label>
            <Input
              id="companyName"
              type="text"
              placeholder="Acme Inc."
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
          </div>

          {/* Industry */}
          <div className="space-y-2">
            <label
              htmlFor="industry"
              className="text-sm font-medium leading-none"
            >
              Industry
            </label>
            <div className="relative">
              <select
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                disabled={isLoading}
                className="flex h-10 w-full appearance-none rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select industry</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Company Size */}
          <div className="space-y-2">
            <label
              htmlFor="companySize"
              className="text-sm font-medium leading-none"
            >
              Company Size
            </label>
            <div className="relative">
              <select
                id="companySize"
                value={companySize}
                onChange={(e) => setCompanySize(e.target.value)}
                disabled={isLoading}
                className="flex h-10 w-full appearance-none rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">Select company size</option>
                {COMPANY_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size} employees
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Primary Use Case */}
          <div className="space-y-2">
            <label
              htmlFor="primaryUseCase"
              className="text-sm font-medium leading-none"
            >
              Primary Use Case
            </label>
            <textarea
              id="primaryUseCase"
              placeholder="Tell us how you plan to use KYRA AI Guardrail..."
              value={primaryUseCase}
              onChange={(e) => setPrimaryUseCase(e.target.value)}
              disabled={isLoading}
              rows={3}
              className="flex w-full rounded-sm border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Saving...
              </div>
            ) : (
              "Continue"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
