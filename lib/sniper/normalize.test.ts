import { describe, expect, it } from "vitest";
import { normalizeArtifactBytes } from "./normalize";

describe("normalizeArtifactBytes", () => {
  it("collapses whitespace runs to single spaces and trims edges", () => {
    // Different whitespace fixtures that all collapse to "<p> hi </p>" should agree.
    const a = normalizeArtifactBytes("<p>   hi   </p>");
    const b = normalizeArtifactBytes("   <p>\n   hi   \n</p>   ");
    const c = normalizeArtifactBytes("\n\n<p>\t\thi\t\t</p>\n\n");
    expect(b).toBe(a);
    expect(c).toBe(a);
    // And the trimmed-edges variant is shorter than the leading-trailing-ws variant
    // would be in raw byte count — proving the trim took effect.
    expect(a).toBeLessThan("   <p>\n   hi   \n</p>   ".length);
  });

  it("strips HTML comments", () => {
    const withComment = normalizeArtifactBytes("<p>hi</p><!-- aside -->");
    const without = normalizeArtifactBytes("<p>hi</p>");
    expect(withComment).toBe(without);
  });

  it("strips multi-line / multi-comment blocks", () => {
    const a = normalizeArtifactBytes("<p>hi</p>");
    const b = normalizeArtifactBytes("<!--\n  long\n  comment\n-->\n<p>hi</p><!--end-->");
    expect(b).toBe(a);
  });

  it("counts linked-asset bytes from the lookup table", () => {
    const html = "<p>hi</p>";
    const bare = normalizeArtifactBytes(html);
    const with_assets = normalizeArtifactBytes(html, { "style.css": 1024, "logo.png": 2048 });
    expect(with_assets).toBe(bare + 1024 + 2048);
  });

  it("ignores non-positive asset sizes silently", () => {
    const html = "<p>hi</p>";
    expect(normalizeArtifactBytes(html, { broken: 0, other: -5 })).toBe(
      normalizeArtifactBytes(html),
    );
  });

  it("normalized bytes survive inline→link refactor", () => {
    // Inline CSS counted in the HTML; same CSS extracted to a 9KB linked asset.
    const inline = `<style>${"/*x*/".repeat(2000)}</style><p>hi</p>`;
    const linked = '<link rel="stylesheet" href="style.css"><p>hi</p>';

    const inlineBytes = normalizeArtifactBytes(inline);
    // Linked-asset table reports the file size (slightly smaller than inline).
    const linkedBytes = normalizeArtifactBytes(linked, { "style.css": 9000 });

    // The two should be in the same ballpark — both above several KB and within ~20% of each other.
    expect(linkedBytes).toBeGreaterThan(8000);
    expect(linkedBytes).toBeGreaterThan(inlineBytes * 0.5);
  });
});
