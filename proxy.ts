import { type NextRequest, NextResponse } from "next/server";
import { requireOwnerLogins } from "@/lib/env";

const EXEMPT_PREFIXES = ["/api/health", "/favicon.ico", "/_next/", "/static/"];
const IDENTITY_HEADER_CANDIDATES = ["tailscale-user-login", "tailscale-login"];

// Tailnet CIDRs per https://tailscale.com/kb/1015/100.x-addresses
// 100.64.0.0/10 covers 100.64.0.0 – 100.127.255.255 (IPv4)
// fd7a:115c:a1e0::/48 is Tailscale's ULA prefix (IPv6)
function inTailnet(rawIp: string): boolean {
  const ip = rawIp.trim();
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\./);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return a === 100 && b >= 64 && b <= 127;
  }
  return ip.toLowerCase().startsWith("fd7a:115c:a1e0:");
}

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return NextResponse.next();
  }

  // Defense in depth: when X-Forwarded-For is set, the first IP is the
  // originating client (per Tailscale Serve's behavior). If it's outside the
  // tailnet CIDR, reject before reading the identity header — prevents header
  // spoofing from anything that reaches the loopback port directly.
  // When X-Forwarded-For is absent (e.g., a SystemD healthchecker on lo),
  // fall through so the exempt-prefix / identity-header logic decides.
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const originator = xff.split(",")[0]?.trim() ?? "";
    if (originator && !inTailnet(originator)) {
      console.warn(
        `[faro] auth: rejected ${path} (non-tailnet X-Forwarded-For=${originator})`,
      );
      return new NextResponse("forbidden", { status: 403 });
    }
  }

  let login = "";
  for (const hdr of IDENTITY_HEADER_CANDIDATES) {
    const v = req.headers.get(hdr);
    if (v) {
      login = v;
      break;
    }
  }

  let ownerLogins: string[];
  try {
    ownerLogins = requireOwnerLogins();
  } catch (err) {
    // env unset → 503 (not 403) so misconfiguration is distinguishable from auth failure
    const msg = err instanceof Error ? err.message : "env error";
    console.error(`[faro] auth: ${msg}`);
    return new NextResponse("service misconfigured", { status: 503 });
  }

  if (!login || !ownerLogins.includes(login)) {
    console.warn(`[faro] auth: rejected ${path} (login=${login || "(missing)"})`);
    return new NextResponse("forbidden", { status: 403 });
  }

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-faro-login", login);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
