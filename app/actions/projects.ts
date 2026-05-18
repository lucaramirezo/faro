"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProfile } from "@/lib/profiles";
import { archiveProject, createProject, type ProjectRow } from "@/lib/projects";
import { setStudioLayout } from "@/lib/studio-layout";

/**
 * P2 Studio Server Actions.
 *
 * profileId is ALWAYS resolved server-side from getProfile() — never trust a
 * client-supplied profile. createProject / archiveProject mutate the project
 * list → revalidate /studio. persistStudioLayout is fire-and-forget UI state;
 * it must NOT revalidate (revalidating would remount the Dockview shell on
 * every drag/resize). All inputs are untrusted (Server Action boundary).
 */

const NameSchema = z.string().trim().min(1).max(200);
const IdSchema = z.string().min(1).max(128);

export type CreateProjectResult = { ok: true; project: ProjectRow } | { ok: false; error: string };

export async function createProjectAction(name: string): Promise<CreateProjectResult> {
  const parsed = NameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid project name" };
  const project = createProject(getProfile().profile, { name: parsed.data });
  revalidatePath("/studio");
  return { ok: true, project };
}

export async function archiveProjectAction(id: string): Promise<{ ok: boolean }> {
  const parsed = IdSchema.safeParse(id);
  if (!parsed.success) return { ok: false };
  archiveProject(parsed.data);
  revalidatePath("/studio");
  return { ok: true };
}

export async function persistStudioLayoutAction(json: string): Promise<{ ok: boolean }> {
  try {
    if (typeof json !== "string" || json.length > 512 * 1024) return { ok: false };
    const layout = JSON.parse(json) as unknown;
    if (typeof layout !== "object" || layout === null) return { ok: false };
    setStudioLayout(getProfile().profile, layout);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
