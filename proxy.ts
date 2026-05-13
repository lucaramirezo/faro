import crypto from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { requireOwnerLogins } from "@/lib/env";

const EXEMPT_PREFIXES = ["/api/health", "/favicon.ico", "/_next/", "/static/"];
const IDENTITY_HEADER_CANDIDATES = ["tailscale-user-login", "tailscale-login"];

function buildCspWithNonce(nonce: string): string {
  // script-src: nonce + strict-dynamic. The nonce lets framework-emitted
  // scripts execute; strict-dynamic lets those scripts load further chunks
  // without an explicit allowlist. style-src keeps 'unsafe-inline' as a
  // Phase 2.1 residual — Tremor / Sonner / Radix all inject inline styles.
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    // 'self' (not 'none') so the studio's HtmlRenderer iframe can frame
    // /studio/raw/<id>. Both pages are served from the same origin.
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function attachNonce(response: NextResponse, nonce: string): NextResponse {
  response.headers.set("Content-Security-Policy", buildCspWithNonce(nonce));
  return response;
}

/**
 * Per Next.js CSP guide
 * (https://nextjs.org/docs/app/guides/content-security-policy), framework-
 * level nonce propagation REQUIRES the `Content-Security-Policy` header to
 * also be present on the *request* (not just the response). Next.js reads it
 * to know which CSP applies during render and stamps the nonce onto every
 * `<script>` it emits — including the runtime + chunk loader. Without this
 * the `_next/static/chunks/*.js` loads fail with "violates the following
 * Content Security Policy directive: script-src ... 'strict-dynamic'".
 */
function setRequestCspHeaders(headersRef: Headers, nonce: string): void {
  headersRef.set("x-nonce", nonce);
  headersRef.set("Content-Security-Policy", buildCspWithNonce(nonce));
}

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
  const nonce = crypto.randomBytes(16).toString("base64");
  if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return attachNonce(NextResponse.next(), nonce);
  }

  // Dev-only convenience: when NODE_ENV !== production AND no identity
  // header is set, inject the first configured owner login so localhost
  // browsing works without a header-spoofing extension. Production traffic
  // via Tailscale Serve always has the real header set + this branch is
  // gated by NODE_ENV so it never fires on pei (systemd sets production).
  if (process.env.NODE_ENV !== "production" && !req.headers.get("tailscale-user-login")) {
    let owners: string[] = [];
    try {
      owners = requireOwnerLogins();
    } catch {
      // misconfigured — fall through to the normal failure path
    }
    if (owners.length > 0) {
      const requestHeaders = new Headers(req.headers);
      requestHeaders.set("x-faro-login", owners[0]);
      setRequestCspHeaders(requestHeaders, nonce);
      console.log(`[faro] auth: dev-mode auto-login as ${owners[0]} for ${path}`);
      return attachNonce(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
    }
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
      console.warn(`[faro] auth: rejected ${path} (non-tailnet X-Forwarded-For=${originator})`);
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
  setRequestCspHeaders(requestHeaders, nonce);
  return attachNonce(NextResponse.next({ request: { headers: requestHeaders } }), nonce);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
