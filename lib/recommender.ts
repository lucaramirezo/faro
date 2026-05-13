import "server-only";

import { type ApprovedSurfacedRow, getApprovedSurfacedClaimsWithPromote } from "@/lib/claims";

export interface RecCandidate extends ApprovedSurfacedRow {
  suggestedSlug: string;
}

/**
 * Deterministic kebab-case slug from the first 6 words of the claim text.
 * ASCII-only, alphanumeric + hyphen. Used as a hint for /install-skill —
 * the user can override at copy-as-prompt time.
 */
export function suggestSlug(claimText: string): string {
  const ascii = claimText
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]+/g, " ")
    .trim();
  const words = ascii.split(/\s+/).filter(Boolean).slice(0, 6);
  return words.join("-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function toCandidate(row: ApprovedSurfacedRow): RecCandidate {
  return { ...row, suggestedSlug: suggestSlug(row.claim_text) };
}

export interface RecommenderResult {
  skills: RecCandidate[];
  wikiCandidates: RecCandidate[];
  total: number;
}

export async function getRecommenderCandidates(): Promise<RecommenderResult> {
  const { bySource } = getApprovedSurfacedClaimsWithPromote();
  const skills = bySource.skill.map(toCandidate);
  const wikiCandidates = bySource.wiki.map(toCandidate);
  return {
    skills,
    wikiCandidates,
    total: skills.length + wikiCandidates.length,
  };
}
