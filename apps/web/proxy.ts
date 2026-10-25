import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 1. Rejects cross-site state-changing API calls (CSRF defence in depth on top
 *    of SameSite cookies and JSON bodies).
 * 2. Keeps Supabase auth cookies fresh for signed-in areas (Server Components
 *    can't write cookies). Authorization itself happens in pages, API
 *    handlers and the database, not here.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    // Behind the ftcoverdrive.org proxy the Host is the app's own domain, so the
    // public site's host (from APP_URL) counts as same-site too.
    const allowed = new Set(
      [
        request.headers.get("host"),
        request.headers.get("x-forwarded-host"),
        appHost(),
      ].filter(Boolean),
    );
    if (origin && !allowed.has(safeHost(origin))) {
      return NextResponse.json({ error: "Cross-site request blocked." }, { status: 403 });
    }
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  // Driver sessions (Supabase Auth). The admin uses its own signed cookie.
  const needsSession = /^\/(driver|login|auth|api\/(driver|auth))(\/|$)/.test(pathname);
  if (!needsSession || process.env.DATA_BACKEND === "local" || !url || !key)
    return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const c of list) request.cookies.set(c.name, c.value);
        response = NextResponse.next({ request });
        for (const c of list) response.cookies.set(c.name, c.value, c.options);
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

function appHost() {
  return process.env.APP_URL ? safeHost(process.env.APP_URL) : null;
}

function safeHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return "invalid";
  }
}

export const config = {
  matcher: ["/driver/:path*", "/login", "/auth/:path*", "/api/:path*"],
};
