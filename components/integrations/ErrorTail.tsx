"use client";

import { useState } from "react";

export interface ErrorTailProps {
  errors: string[];
}

export function ErrorTail({ errors }: ErrorTailProps) {
  const [open, setOpen] = useState(false);
  if (errors.length === 0) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        {open ? "hide" : "show"} {errors.length} error{errors.length === 1 ? "" : "s"}
      </button>
      {open && (
        <pre className="mt-1 whitespace-pre-wrap font-mono text-xs text-destructive bg-muted/40 p-2 rounded-md">
          {errors.join("\n")}
        </pre>
      )}
    </div>
  );
}
