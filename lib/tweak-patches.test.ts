import { describe, expect, it } from "vitest";
import type { ClaimRow } from "@/lib/claims-types";
import {
  applyTweakPatch,
  decodeEnvelope,
  encodeEnvelope,
  TWEAK_PATCH_SCHEMA_VERSION,
  type TweakPatch,
  TweakPatchSchema,
} from "@/lib/tweak-patches";

function makeClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  return {
    claim_id: "c1",
    run_id: "r1",
    profile_id: "lwiki",
    category: "surfaced",
    section_path: "/dreams/2026-05-13",
    section_path_canonical: null,
    claim_text: "Marc shipped the POS module on Tuesday.",
    evidence: [],
    status: "pending",
    tweak_text: null,
    reviewer_note: null,
    decided_at: null,
    decided_by: null,
    parent_claim_id: null,
    superseded_at: null,
    promote_to: null,
    ...overrides,
  };
}

describe("applyTweakPatch: set-text", () => {
  it("replaces claim_text and reports the char count", () => {
    const result = applyTweakPatch(makeClaim(), {
      kind: "set-text",
      text: "Marc shipped POS on Tuesday.",
    });
    expect(result.claim.claim_text).toBe("Marc shipped POS on Tuesday.");
    expect(result.description).toMatch(/Set claim text \(28 chars\)/);
  });

  it("rejects empty text via Zod", () => {
    expect(() =>
      applyTweakPatch(makeClaim(), { kind: "set-text", text: "" } as TweakPatch),
    ).toThrow();
  });
});

describe("applyTweakPatch: set-status", () => {
  it("updates status and describes the transition", () => {
    const result = applyTweakPatch(makeClaim({ status: "pending" }), {
      kind: "set-status",
      status: "approved",
    });
    expect(result.claim.status).toBe("approved");
    expect(result.description).toBe("Status: pending → approved");
  });

  it("rejects an unknown status", () => {
    expect(() =>
      applyTweakPatch(makeClaim(), {
        kind: "set-status",
        status: "frobulated" as never,
      }),
    ).toThrow();
  });
});

describe("applyTweakPatch: merge-with", () => {
  it("marks status=tweaked and sets parent_claim_id", () => {
    const result = applyTweakPatch(makeClaim(), {
      kind: "merge-with",
      otherClaimId: "c-other",
    });
    expect(result.claim.parent_claim_id).toBe("c-other");
    expect(result.claim.status).toBe("tweaked");
    expect(result.description).toContain("c-other");
  });

  it("rejects an empty otherClaimId", () => {
    expect(() =>
      applyTweakPatch(makeClaim(), {
        kind: "merge-with",
        otherClaimId: "",
      }),
    ).toThrow();
  });
});

describe("applyTweakPatch: set-rubric-score", () => {
  it("writes the score as a [rubric:N/10] prefix on reviewer_note", () => {
    const result = applyTweakPatch(makeClaim(), {
      kind: "set-rubric-score",
      score: 7,
    });
    expect(result.claim.reviewer_note).toBe("[rubric:7/10]");
  });

  it("preserves an existing reviewer_note as a suffix", () => {
    const result = applyTweakPatch(makeClaim({ reviewer_note: "needs more evidence" }), {
      kind: "set-rubric-score",
      score: 4,
    });
    expect(result.claim.reviewer_note).toBe("[rubric:4/10] needs more evidence");
  });

  it("rejects out-of-range scores", () => {
    expect(() => applyTweakPatch(makeClaim(), { kind: "set-rubric-score", score: 11 })).toThrow();
    expect(() => applyTweakPatch(makeClaim(), { kind: "set-rubric-score", score: -1 })).toThrow();
  });
});

describe("applyTweakPatch: purity", () => {
  it("does not mutate the input claim", () => {
    const original = makeClaim();
    const snapshot = JSON.stringify(original);
    applyTweakPatch(original, { kind: "set-text", text: "different" });
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});

describe("envelope encode/decode", () => {
  it("round-trips a patch with schema_version", () => {
    const patch: TweakPatch = { kind: "set-text", text: "hello" };
    const encoded = encodeEnvelope(patch);
    expect(JSON.parse(encoded)).toEqual({
      schema_version: TWEAK_PATCH_SCHEMA_VERSION,
      patch,
    });
    const decoded = decodeEnvelope(encoded);
    expect(decoded.schema_version).toBe(TWEAK_PATCH_SCHEMA_VERSION);
    expect(decoded.patch).toEqual(patch);
  });

  it("rejects an envelope with the wrong schema_version", () => {
    const wrong = JSON.stringify({
      schema_version: 99,
      patch: { kind: "set-text", text: "x" },
    });
    expect(() => decodeEnvelope(wrong)).toThrow();
  });

  it("rejects an envelope with a malformed patch", () => {
    const bad = JSON.stringify({
      schema_version: TWEAK_PATCH_SCHEMA_VERSION,
      patch: { kind: "set-text" },
    });
    expect(() => decodeEnvelope(bad)).toThrow();
  });
});

describe("TweakPatchSchema (raw)", () => {
  it("accepts all 4 variants", () => {
    const variants: TweakPatch[] = [
      { kind: "set-text", text: "a" },
      { kind: "set-status", status: "approved" },
      { kind: "merge-with", otherClaimId: "x" },
      { kind: "set-rubric-score", score: 5 },
    ];
    for (const v of variants) {
      expect(TweakPatchSchema.parse(v)).toEqual(v);
    }
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      TweakPatchSchema.parse({ kind: "explode", boom: true } as unknown as TweakPatch),
    ).toThrow();
  });
});
