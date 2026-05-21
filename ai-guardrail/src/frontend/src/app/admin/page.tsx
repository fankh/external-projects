"use client";
import { useEffect } from "react";
export default function AdminRedirect() {
  useEffect(() => {
    window.location.href = "https://admin.kyra-guardrail-dev.seekerslab.com/";
  }, []);
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Redirecting to admin console...
    </div>
  );
}
