import { describe, expect, it } from "vitest";
import { extractHtml, previewHtml } from "@/lib/extract-html";

describe("extract-html — the 5-rung ladder", () => {
  it("rung 1: strips a ```html fence and trusts the inner doc", () => {
    const out = extractHtml("Here you go:\n```html\n<!DOCTYPE html><html></html>\n```\nDone.");
    expect(out).toBe("<!DOCTYPE html><html></html>");
  });

  it("rung 2: slices from <!DOCTYPE html> to the last </html>", () => {
    const out = extractHtml("blah <!DOCTYPE html><html><body>x</body></html> trailing chatter");
    expect(out).toBe("<!DOCTYPE html><html><body>x</body></html>");
  });

  it("rung 2 (streaming/partial): returns from doctype to end when no close", () => {
    const out = extractHtml("preamble <!DOCTYPE html><html><body>partial");
    expect(out).toBe("<!DOCTYPE html><html><body>partial");
  });

  it("rung 3: <html> scan when no doctype", () => {
    const out = extractHtml('intro <html lang="en"><body>y</body></html> after');
    expect(out).toBe('<html lang="en"><body>y</body></html>');
  });

  it("rung 4: leading < is trusted whole", () => {
    const out = extractHtml("<section>just a fragment</section>");
    expect(out).toBe("<section>just a fragment</section>");
  });

  it("rung 5: self-contained scaffold, NO cdn.tailwindcss.com, escapes content", () => {
    const out = extractHtml("plain text with <tag> & ampersand");
    expect(out).toMatch(/<!doctype html>/i);
    expect(out).not.toContain("cdn.tailwindcss.com");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;tag&gt;");
    expect(out).toContain("&amp;");
    expect(out).toContain("color-scheme: dark");
  });

  it("empty input → empty string", () => {
    expect(extractHtml("")).toBe("");
  });

  it("previewHtml appends a closer when the stream lacks </html>", () => {
    const partial = extractHtml("<!DOCTYPE html><html><body>streaming…");
    const preview = previewHtml("<!DOCTYPE html><html><body>streaming…");
    expect(partial).not.toMatch(/<\/html>/i);
    expect(preview.endsWith("\n</body>\n</html>")).toBe(true);
  });

  it("previewHtml leaves a complete doc untouched", () => {
    const full = "<!DOCTYPE html><html><body>x</body></html>";
    expect(previewHtml(full)).toBe(full);
  });
});
