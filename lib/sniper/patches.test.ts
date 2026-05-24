import { describe, expect, it } from "vitest";
import { applyPatch } from "./patches";
import { SourcePatchSchema } from "./patches-types";

const FIXTURE = `<!DOCTYPE html>
<html><head><style>:root { --primary: #000; } /* token block */</style></head>
<body>
  <!-- top comment -->
  <h1 data-faro-id="hero-h1">Old Heading</h1>
  <a data-faro-id="cta" href="https://old.example/">Click</a>
  <div data-faro-id="card" style="color: red; padding: 8px">
    <p data-faro-runtime-id="rt-1">Run-time stamped</p>
    <img data-faro-source-path="src/img" src="old.png" alt="old"/>
  </div>
  <span class="positional-target">Positional</span>
  <button data-faro-id="protected-btn" data-faro-edit="locked">Pressed</button>
</body></html>`;

describe("applyPatch — locator strategies", () => {
  it("finds by data-faro-id (strategy 1)", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "hero-h1", text: "New Heading" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toContain("New Heading");
  });

  it("finds by data-faro-runtime-id (strategy 2)", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "rt-1", text: "Run-time edited" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toContain("Run-time edited");
  });

  it("finds by data-faro-source-path (strategy 3)", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-attributes",
      id: "src/img",
      attributes: { alt: "rewritten" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toContain('alt="rewritten"');
  });

  it("finds via positional path (strategy 4, body's first child)", () => {
    // FIXTURE's body has whitespace text node + comment + several element children.
    // Positional path uses body.children (element-only), so index 0 = first <h1>.
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "path-0", text: "Path-zero edited" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toContain("Path-zero edited");
  });

  it("__body__ sentinel resolves to <body>", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-attributes",
      id: "__body__",
      attributes: { "data-body-marker": "1" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toContain('data-body-marker="1"');
  });

  it("returns error when element not found", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "no-such-id", text: "x" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not found/);
  });
});

describe("applyPatch — direct-write kinds", () => {
  it("set-text replaces textContent", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "hero-h1", text: "Brand new" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toContain("Brand new");
      expect(r.source).not.toContain("Old Heading");
    }
  });

  it("set-link updates href and optionally text", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-link",
      id: "cta",
      href: "https://new.example/",
      text: "Tap",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toContain('href="https://new.example/"');
      expect(r.source).toContain("Tap");
    }
  });

  it("set-link rejects non-anchor elements", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-link",
      id: "hero-h1",
      href: "https://example.com/",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/<a>/);
  });

  it("set-style merges with existing inline styles", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-style",
      id: "card",
      styles: { color: "blue", margin: "4px" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Existing padding preserved, color overwritten, margin added.
      expect(r.source).toMatch(/style="[^"]*color: blue[^"]*"/);
      expect(r.source).toMatch(/style="[^"]*padding: 8px[^"]*"/);
      expect(r.source).toMatch(/style="[^"]*margin: 4px[^"]*"/);
    }
  });

  it("set-attributes adds + removes", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-attributes",
      id: "card",
      attributes: { "data-new": "x", style: null },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toContain('data-new="x"');
      // style attribute on the card should be gone.
      expect(r.source).not.toMatch(/data-faro-id="card"[^>]*style=/);
    }
  });

  it("set-attributes refuses protected attrs", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-attributes",
      id: "protected-btn",
      attributes: { "data-faro-id": "hijacked" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/protected/);
    // None of the side-effects should have leaked.
  });

  it("set-attributes refuses data-faro-edit / data-faro-label too", () => {
    for (const attr of ["data-faro-edit", "data-faro-label"]) {
      const r = applyPatch(FIXTURE, {
        kind: "set-attributes",
        id: "protected-btn",
        attributes: { [attr]: "hijacked" },
      });
      expect(r.ok).toBe(false);
    }
  });
});

describe("applyPatch — gated kinds", () => {
  it("set-image updates src + alt on <img>", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-image",
      id: "src/img",
      src: "/new.png",
      alt: "fresh",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toContain('src="/new.png"');
      expect(r.source).toContain('alt="fresh"');
    }
  });

  it("set-image rejects non-img", () => {
    const r = applyPatch(FIXTURE, { kind: "set-image", id: "hero-h1", src: "/x.png" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/<img>/);
  });

  it("set-token writes a CSS custom property on inline style", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-token",
      id: "card",
      token: "primary-color",
      value: "#1e90ff",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toMatch(/style="[^"]*--primary-color: #1e90ff[^"]*"/);
    }
  });

  it("set-token preserves a leading -- if caller already provided it", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-token",
      id: "card",
      token: "--brand",
      value: "red",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toMatch(/--brand: red/);
  });

  it("remove-element removes the matched node", () => {
    const r = applyPatch(FIXTURE, { kind: "remove-element", id: "cta" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).not.toContain('data-faro-id="cta"');
  });

  it("set-outer-html replaces the node entirely", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-outer-html",
      id: "hero-h1",
      outerHtml: '<h2 data-faro-id="hero-h1">Now an h2</h2>',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toContain("<h2");
      expect(r.source).toContain("Now an h2");
    }
  });

  it("set-full-source replaces the whole source", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-full-source",
      source: "<!DOCTYPE html><html><body>only this</body></html>",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toBe("<!DOCTYPE html><html><body>only this</body></html>");
    }
  });
});

describe("applyPatch — Zod validation", () => {
  it("rejects bad kind", () => {
    // Bypass TS via cast; Zod is the runtime guard we're proving here.
    const r = applyPatch(FIXTURE, { kind: "set-bogus", id: "x" } as never);
    expect(r.ok).toBe(false);
  });

  it("rejects bad href URL on set-link", () => {
    const r = applyPatch(FIXTURE, {
      kind: "set-link",
      id: "cta",
      href: "not a url",
    });
    expect(r.ok).toBe(false);
  });

  it("Zod schema parses a valid patch", () => {
    const parsed = SourcePatchSchema.safeParse({
      kind: "set-text",
      id: "x",
      text: "y",
    });
    expect(parsed.success).toBe(true);
  });
});

describe("applyPatch — round-trip preserves DOCTYPE + comments + <style>", () => {
  it("keeps the doctype after a benign edit", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "hero-h1", text: "Edited" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source.toLowerCase()).toMatch(/<!doctype html>/);
  });

  it("keeps comment markers", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "hero-h1", text: "Edited" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.source).toContain("<!-- top comment -->");
  });

  it("keeps the <style> block content", () => {
    const r = applyPatch(FIXTURE, { kind: "set-text", id: "hero-h1", text: "Edited" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.source).toContain("--primary: #000");
      expect(r.source).toContain("/* token block */");
    }
  });
});
