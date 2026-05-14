import type { NextConfig } from "next";

// Content-Security-Policy is now per-request and set by `proxy.ts` with a
// per-request nonce + `strict-dynamic`. We keep a default header here as a
// belt-and-braces fallback for any code path that bypasses the proxy (none
// today). `style-src 'unsafe-inline'` remains a v0.1 residual: Tremor, Sonner,
// and Radix all inject inline styles. Tighten in Phase 2.1.
const FALLBACK_CSP = [
  "default-src 'self'",
  "script-src 'self' 'strict-dynamic'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: FALLBACK_CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS is owned by Tailscale Serve at the edge; we don't set it here.
];

const config: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  typescript: {
    ignoreBuildErrors: false,
  },
  async headers() {
    return [
      {
        // Exclude /studio/raw/<id> — the raw-artifact route handler sets its
        // own narrow CSP tailored for sandboxed user-emitted HTML. Layering
        // the fallback CSP on top creates a stricter combined policy that
        // blocks the inline `<script>` tags artifacts are allowed to carry.
        source: "/((?!studio/raw/).*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default config;
