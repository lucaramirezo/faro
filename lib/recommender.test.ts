import { describe, expect, it } from "vitest";
import { suggestSlug } from "@/lib/recommender";

describe("suggestSlug", () => {
  it("kebab-cases the first 6 words", () => {
    // "Should we add a /install-skill command?" → 6 words after the slash strip.
    expect(suggestSlug("Should we add a /install-skill command?")).toBe(
      "should-we-add-a-install-skill-command",
    );
  });

  it("caps slug at first 6 words", () => {
    expect(suggestSlug("one two three four five six seven eight nine")).toBe(
      "one-two-three-four-five-six",
    );
  });

  it("strips non-ASCII punctuation", () => {
    expect(suggestSlug("Add /debug-port-forward for tailnet diagnosis")).toBe(
      "add-debug-port-forward-for-tailnet-diagnosis",
    );
  });

  it("collapses runs of separators", () => {
    expect(suggestSlug("foo --- bar____baz")).toBe("foo-bar-baz");
  });

  it("returns empty string for unprintable input", () => {
    expect(suggestSlug("!!!")).toBe("");
  });

  it("is deterministic", () => {
    const s1 = suggestSlug("entity: Andersen Consulting flagged for outreach 2026-05-11");
    const s2 = suggestSlug("entity: Andersen Consulting flagged for outreach 2026-05-11");
    expect(s1).toBe(s2);
  });
});
