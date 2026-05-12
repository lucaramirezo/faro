import { NextResponse } from "next/server";
import { readWikiPage } from "@/lib/memory";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await ctx.params;
  const decoded = decodeURIComponent(slug);
  if (decoded.includes("..") || decoded.startsWith("/")) {
    return NextResponse.json({ error: "invalid slug" }, { status: 400 });
  }
  const profile = getProfile();
  const page = await readWikiPage(profile.agent_root, decoded);
  if (!page) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ slug: decoded, body: page.body, frontmatter: page.frontmatter });
}
