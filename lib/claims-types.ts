/**
 * Shared types + categories for the claim-decisions surface. Lives in its
 * own module (no Node imports) so client components can import types
 * without dragging ``better-sqlite3`` into the client bundle.
 */

export type ClaimStatus = "pending" | "approved" | "denied" | "tweaked" | "deferred";

export type ClaimCategory = "merged" | "resolved" | "pruned" | "surfaced";

export const CLAIM_CATEGORIES: readonly ClaimCategory[] = [
  "merged",
  "resolved",
  "pruned",
  "surfaced",
] as const;

export interface ClaimRow {
  claim_id: string;
  run_id: string;
  profile_id: string;
  category: ClaimCategory;
  section_path: string;
  section_path_canonical: string | null;
  claim_text: string;
  evidence: Array<{
    kind: string;
    path?: string;
    lineno?: number;
    snippet?: string;
  }>;
  status: ClaimStatus;
  tweak_text: string | null;
  reviewer_note: string | null;
  decided_at: string | null;
  decided_by: string | null;
  parent_claim_id: string | null;
  superseded_at: string | null;
}

export interface GroupedClaims {
  pending: ClaimRow[];
  decided: ClaimRow[];
  byCategory: Record<ClaimCategory, ClaimRow[]>;
  total: number;
}
