import { SkillCard } from "@/components/skills/SkillCard";
import { getProfile } from "@/lib/profiles";
import { scanSkills } from "@/lib/skills/parser";
import type { Skill, SkillUsage } from "@/lib/skills/types";
import { getSkillUsage } from "@/lib/skills/usage";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const profile = getProfile();
  const skillsPromise = scanSkills({ agentRoot: profile.agent_root }).catch((err) => {
    console.error("[faro] skills: scan failed", err);
    return [] as Skill[];
  });
  const usagePromise = getSkillUsage({ agentRoot: profile.agent_root }).catch((err) => {
    console.error("[faro] skills: usage fetch failed", err);
    return new Map<string, SkillUsage>();
  });
  const [skills, usage] = await Promise.all([skillsPromise, usagePromise]);

  const projectSkills = skills.filter((s) => s.scope === "project");
  const importedSkills = skills.filter((s) => s.scope === "imported");
  const globalSkills = skills.filter((s) => s.scope === "global");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Skills</h1>
        <p className="text-sm text-muted-foreground">
          Skills discovered under <code>~/.claude/skills/</code> (global) and{" "}
          <code>{`${profile.agent_root}/.claude/skills/`}</code> (project), with 7-day usage
          rollups.
        </p>
      </header>

      <Section
        title="Project"
        skills={projectSkills}
        usage={usage}
        emptyHint="No project skills found."
      />
      <Section
        title="Imported"
        skills={importedSkills}
        usage={usage}
        emptyHint="No imported skills found. Vendored html-anything SKILL.md briefs live under faro/.claude/skills/imported/."
      />
      <Section
        title="Global"
        skills={globalSkills}
        usage={usage}
        emptyHint="No global skills found."
      />
    </main>
  );
}

function Section({
  title,
  skills,
  usage,
  emptyHint,
}: {
  title: string;
  skills: Skill[];
  usage: Map<string, SkillUsage>;
  emptyHint: string;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wider font-medium text-muted-foreground">
        {title} <span className="text-muted-foreground/60">({skills.length})</span>
      </h2>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {skills.map((skill) => (
            <SkillCard
              key={`${skill.scope}-${skill.name}`}
              skill={skill}
              usage={usage.get(skill.name)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
