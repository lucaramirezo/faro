import { type NextRequest, NextResponse } from "next/server";

const EXEMPT_PREFIXES = ["/api/health", "/favicon.ico", "/_next/", "/static/"];
const IDENTITY_HEADER_CANDIDATES = ["tailscale-user-login", "tailscale-login"];

const OWNER_LOGINS = (process.env.FARO_OWNER_LOGIN ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (EXEMPT_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return NextResponse.next();
  }

  let login = "";
  for (const hdr of IDENTITY_HEADER_CANDIDATES) {
    const v = req.headers.get(hdr);
    if (v) {
      login = v;
      break;
    }
  }

  if (!login || !OWNER_LOGINS.includes(login)) {
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
