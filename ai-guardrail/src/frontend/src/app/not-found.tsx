"use client";

import Link from "next/link";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Shield className="h-8 w-8 text-primary" />
          </div>
        </div>
        <div>
          <h1 className="text-6xl font-bold text-foreground">404</h1>
          <p className="text-xl text-muted-foreground mt-2">Page Not Found</p>
          <p className="text-sm text-muted-foreground mt-1">
            The page you are looking for does not exist or has been moved.
          </p>
        </div>
        <Link href="/chat">
          <Button size="lg">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
