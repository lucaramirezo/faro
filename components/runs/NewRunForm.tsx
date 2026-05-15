"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Launch a §6.9 generation run: pick an imported SKILL.md brief, paste the
 * source content, POST /api/runs → navigate to the live /runs/[runId] view.
 * Client island (the RSC /runs page is server-only). a11y: labelled controls,
 * <button type="submit"> via the form.
 */

export interface ImportedSkillOption {
  name: string;
  description: string;
}

export function NewRunForm({
  skills,
  defaultSkill,
}: {
  skills: ImportedSkillOption[];
  defaultSkill?: string;
}) {
  const router = useRouter();
  const [skillName, setSkillName] = useState(
    defaultSkill && skills.some((s) => s.name === defaultSkill)
      ? defaultSkill
      : (skills[0]?.name ?? ""),
  );
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!skillName || content.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "generation", skillName, content }),
      });
      if (!res.ok) {
        throw new Error(`launch: ${res.status} ${await res.text().catch(() => "")}`);
      }
      const { runId } = (await res.json()) as { runId: string };
      router.push(`/runs/${runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  if (skills.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No imported skills available. Add a vendored SKILL.md under{" "}
        <code>faro/.claude/skills/imported/</code> to enable generation runs.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-lg border border-border p-4">
      <div className="space-y-1">
        <label htmlFor="run-skill" className="text-xs font-medium text-muted-foreground">
          Skill brief
        </label>
        <select
          id="run-skill"
          value={skillName}
          onChange={(e) => setSkillName(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
        >
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} — {s.description}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label htmlFor="run-content" className="text-xs font-medium text-muted-foreground">
          Source content
        </label>
        <Textarea
          id="run-content"
          rows={6}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Paste the content the artifact should be generated from…"
          disabled={busy}
          className="resize-none text-sm"
        />
      </div>
      {error && <p className="text-xs text-destructive">[error: {error}]</p>}
      <Button type="submit" size="sm" disabled={busy || content.trim().length === 0}>
        {busy ? "Launching…" : "Launch generation run"}
      </Button>
    </form>
  );
}
