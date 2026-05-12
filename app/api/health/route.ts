import { NextResponse } from "next/server";
import { getProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = getProfile();
  return NextResponse.json({
    status: "ok",
    profile: profile.profile,
    timestamp: new Date().toISOString(),
  });
}
