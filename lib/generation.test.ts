import { describe, expect, it } from "vitest";
import {
  assembleGenerationPrompt,
  GENERATION_SYSTEM_PROMPT,
  MAX_CONTENT_CHARS,
  SHARED_DESIGN_DIRECTIVES,
} from "@/lib/generation";

describe("generation — prompt assembly", () => {
  it("assembles in the locked order: directives → skill body → format → content", () => {
    const prompt = assembleGenerationPrompt({
      skillBody: "SKILL-BODY-MARKER",
      content: "USER-CONTENT-MARKER",
      format: "markdown",
    });
    const iDirectives = prompt.indexOf(SHARED_DESIGN_DIRECTIVES.slice(0, 32));
    const iSkill = prompt.indexOf("SKILL-BODY-MARKER");
    const iFormat = prompt.indexOf("Input format: markdown");
    const iContent = prompt.indexOf("User content:");
    const iUser = prompt.indexOf("USER-CONTENT-MARKER");
    expect(iDirectives).toBe(0);
    expect(iDirectives).toBeLessThan(iSkill);
    expect(iSkill).toBeLessThan(iFormat);
    expect(iFormat).toBeLessThan(iContent);
    expect(iContent).toBeLessThan(iUser);
  });

  it("trims the skill body and keeps user content last", () => {
    const prompt = assembleGenerationPrompt({
      skillBody: "  briefed  ",
      content: "the-content",
      format: "text",
    });
    expect(prompt).toContain("\nbriefed\n");
    expect(prompt.trimEnd().endsWith("the-content")).toBe(true);
  });

  it("truncates oversized content with a visible note", () => {
    const big = "x".repeat(MAX_CONTENT_CHARS + 500);
    const prompt = assembleGenerationPrompt({ skillBody: "b", content: big, format: "text" });
    expect(prompt).toContain("…[truncated 500 chars]");
    expect(prompt.length).toBeLessThan(SHARED_DESIGN_DIRECTIVES.length + MAX_CONTENT_CHARS + 500);
  });

  it("respects a custom sharedDirectives override", () => {
    const prompt = assembleGenerationPrompt({
      sharedDirectives: "CUSTOM-DIRECTIVES",
      skillBody: "b",
      content: "c",
      format: "text",
    });
    expect(prompt.startsWith("CUSTOM-DIRECTIVES")).toBe(true);
    expect(prompt).not.toContain(SHARED_DESIGN_DIRECTIVES);
  });

  it("system prompt forbids tools and demands a single fenced html block", () => {
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/no file-system or shell tools/i);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/```html/);
    expect(GENERATION_SYSTEM_PROMPT).toMatch(/<!doctype html>/i);
  });

  it("directives carry the anti-AI-slop bar (dark, no Inter, no purple, no CDN)", () => {
    expect(SHARED_DESIGN_DIRECTIVES).toMatch(/data-theme="dark"/);
    expect(SHARED_DESIGN_DIRECTIVES).toMatch(/NEVER use Inter/);
    expect(SHARED_DESIGN_DIRECTIVES).toMatch(/NO purple gradients/);
    expect(SHARED_DESIGN_DIRECTIVES).not.toContain("cdn.tailwindcss.com");
  });
});
