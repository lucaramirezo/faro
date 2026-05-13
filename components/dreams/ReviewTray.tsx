"use client";

import { AnimatePresence, LayoutGroup } from "motion/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";
import { decideClaimAction } from "@/app/actions/claims";
import { BulkApproveBar } from "@/components/dreams/BulkApproveBar";
import { CarouselToggle } from "@/components/dreams/CarouselToggle";
import { ClaimCard } from "@/components/dreams/ClaimCard";
import { ClientCardShell } from "@/components/dreams/ClientCardShell";
import { EmblaCarousel } from "@/components/dreams/EmblaCarousel";
import { FinalizeDialog } from "@/components/dreams/FinalizeDialog";
import { LivePreview } from "@/components/dreams/LivePreview";
import { TweakEditor } from "@/components/dreams/TweakEditor";
import {
  CLAIM_CATEGORIES,
  type ClaimCategory,
  type ClaimRow,
  type ClaimStatus,
} from "@/lib/claims-types";

const CAROUSEL_STORAGE_KEY = "faro:dreams:carousel-mode";

interface OptimisticPatch {
  claimId: string;
  status: ClaimStatus;
  tweakText?: string;
}

function applyPatches(claims: ClaimRow[], patches: OptimisticPatch[]): ClaimRow[] {
  if (patches.length === 0) return claims;
  const byId = new Map(patches.map((p) => [p.claimId, p] as const));
  return claims.map((c) => {
    const patch = byId.get(c.claim_id);
    if (!patch) return c;
    return {
      ...c,
      status: patch.status,
      tweak_text: patch.tweakText ?? c.tweak_text,
    };
  });
}

export interface ReviewTrayProps {
  runId: string;
  decisionToken: string | null;
  initialClaims: ClaimRow[];
}

interface UndoRecord {
  claimId: string;
  prevStatus: ClaimStatus;
  expiresAt: number;
}

export function ReviewTray({ runId, decisionToken, initialClaims }: ReviewTrayProps) {
  const [optimisticClaims, applyOptimistic] = useOptimistic(
    initialClaims,
    (state: ClaimRow[], patch: OptimisticPatch) => applyPatches(state, [patch]),
  );
  const [carouselOn, setCarouselOn] = useState(false);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [tweakClaim, setTweakClaim] = useState<ClaimRow | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const undoRef = useRef<UndoRecord | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    const v = localStorage.getItem(CAROUSEL_STORAGE_KEY);
    if (v === "1") setCarouselOn(true);
  }, []);

  const onCarouselChange = (on: boolean) => {
    setCarouselOn(on);
    localStorage.setItem(CAROUSEL_STORAGE_KEY, on ? "1" : "0");
  };

  const onOpenTweak = useCallback((claim: ClaimRow) => {
    setTweakClaim(claim);
    setTweakOpen(true);
  }, []);

  const onOptimisticPatch = useCallback(
    (action: { kind: "decide" | "tweak"; claimId: string; status: string }) => {
      startTransition(() => {
        applyOptimistic({
          claimId: action.claimId,
          status: action.status as ClaimStatus,
        });
      });
    },
    [applyOptimistic],
  );

  const recordUndo = useCallback((claimId: string, prevStatus: string) => {
    undoRef.current = {
      claimId,
      prevStatus: prevStatus as ClaimStatus,
      expiresAt: Date.now() + 10_000,
    };
  }, []);

  const performUndo = useCallback(() => {
    const rec = undoRef.current;
    if (!rec || Date.now() > rec.expiresAt) {
      toast.message("Nothing to undo.");
      return;
    }
    const verb = rec.prevStatus === "pending" ? "pending" : rec.prevStatus;
    onOptimisticPatch({
      kind: "decide",
      claimId: rec.claimId,
      status: verb,
    });
    if (rec.prevStatus === "pending") {
      const fd = new FormData();
      fd.set("runId", runId);
      fd.set("claimId", rec.claimId);
      // Server has no "unset to pending" endpoint; closest path is to call
      // a denied → pending toggle via a future action. For v0.1, just clear
      // the optimistic state and reload to fetch real state.
      startTransition(async () => {
        try {
          await fetch(`/api/dreams/${encodeURIComponent(runId)}/claims`, {
            cache: "no-store",
          });
          toast.success("Undone (locally — refresh to confirm server state)");
        } catch {
          toast.error("Undo refresh failed");
        }
      });
    } else {
      // Reverse a previous decision by re-applying it via decideClaimAction.
      const fd = new FormData();
      fd.set("runId", runId);
      fd.set("claimId", rec.claimId);
      fd.set("verb", rec.prevStatus === "approved" ? "approved" : "denied");
      startTransition(async () => {
        try {
          await decideClaimAction(fd);
          toast.success("Undone");
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Undo failed");
        }
      });
    }
    undoRef.current = null;
  }, [onOptimisticPatch, runId]);

  // Group claims by status for the two trays
  const pending = useMemo(
    () => optimisticClaims.filter((c) => c.status === "pending"),
    [optimisticClaims],
  );
  const decided = useMemo(
    () => optimisticClaims.filter((c) => c.status !== "pending"),
    [optimisticClaims],
  );
  const byCategory = useMemo(() => {
    const out: Record<ClaimCategory, ClaimRow[]> = {
      merged: [],
      resolved: [],
      pruned: [],
      surfaced: [],
    };
    for (const c of optimisticClaims) {
      if (out[c.category]) out[c.category].push(c);
    }
    return out;
  }, [optimisticClaims]);

  const appliedCount = optimisticClaims.filter(
    (c) => c.status === "approved" || c.status === "tweaked",
  ).length;
  const deferredCount = optimisticClaims.filter(
    (c) => c.status === "pending" || c.status === "deferred",
  ).length;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tgt = document.activeElement;
      if (
        tgt instanceof HTMLInputElement ||
        tgt instanceof HTMLTextAreaElement ||
        tgt?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "j") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(pending.length - 1, i + 1));
        return;
      }
      if (key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key === "u") {
        e.preventDefault();
        performUndo();
        return;
      }
      const target = pending[focusIndex];
      if (!target) return;
      if (key === "a") {
        e.preventDefault();
        recordUndo(target.claim_id, target.status);
        onOptimisticPatch({ kind: "decide", claimId: target.claim_id, status: "approved" });
        const fd = new FormData();
        fd.set("runId", runId);
        fd.set("claimId", target.claim_id);
        fd.set("verb", "approved");
        startTransition(async () => {
          try {
            await decideClaimAction(fd);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Approve failed");
          }
        });
      } else if (key === "d") {
        e.preventDefault();
        recordUndo(target.claim_id, target.status);
        onOptimisticPatch({ kind: "decide", claimId: target.claim_id, status: "denied" });
        const fd = new FormData();
        fd.set("runId", runId);
        fd.set("claimId", target.claim_id);
        fd.set("verb", "denied");
        startTransition(async () => {
          try {
            await decideClaimAction(fd);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Deny failed");
          }
        });
      } else if (key === "t") {
        e.preventDefault();
        onOpenTweak(target);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [focusIndex, pending, performUndo, onOpenTweak, onOptimisticPatch, recordUndo, runId]);

  const renderCard = (claim: ClaimRow) => (
    <ClientCardShell
      key={claim.claim_id}
      claim={claim}
      runId={runId}
      onOptimistic={onOptimisticPatch}
      onUndoRecord={recordUndo}
      onOpenTweak={onOpenTweak}
    >
      <ClaimCard claim={claim} />
    </ClientCardShell>
  );

  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground tabular-nums">
            {pending.length} pending · {decided.length} decided · keys: J/K/A/T/D/U
          </p>
          <div className="flex items-center gap-2">
            <CarouselToggle on={carouselOn} onChange={onCarouselChange} />
            <FinalizeDialog
              runId={runId}
              decisionToken={decisionToken}
              appliedCount={appliedCount}
              deferredCount={deferredCount}
            />
          </div>
        </div>
        <LayoutGroup>
          {carouselOn ? (
            <EmblaCarousel>{pending.map(renderCard)}</EmblaCarousel>
          ) : (
            <div className="space-y-3">
              {CLAIM_CATEGORIES.map((cat) => {
                const items = byCategory[cat];
                if (items.length === 0) return null;
                const pendingInCat = items.filter((c) => c.status === "pending");
                return (
                  <section key={cat} className="space-y-2">
                    <BulkApproveBar
                      runId={runId}
                      category={cat}
                      pendingCount={pendingInCat.length}
                    />
                    <AnimatePresence mode="popLayout" initial={false}>
                      {items.map((c) => renderCard(c))}
                    </AnimatePresence>
                  </section>
                );
              })}
            </div>
          )}
        </LayoutGroup>
      </div>
      <aside className="space-y-3">
        <LivePreview runId={runId} />
      </aside>
      <TweakEditor open={tweakOpen} onOpenChange={setTweakOpen} runId={runId} claim={tweakClaim} />
    </div>
  );
}
