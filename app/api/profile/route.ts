import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = getProfile();
  return NextResponse.json({
    profile: p.profile,
    display_name: p.display_name,
    status: p.status,
  });
}
