"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[faro] root error boundary:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Faro hit an unexpected error. The incident has been logged to the server console.
      </p>
      {isDev && (
        <pre className="text-xs bg-muted/50 p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ""}
        </pre>
      )}
      <div className="pt-2">
        <Button size="sm" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
