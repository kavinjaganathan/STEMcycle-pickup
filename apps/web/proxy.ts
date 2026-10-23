import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Keeps Supabase auth cookies fresh for signed-in areas (Server Components
 * can't write cookies). Authorization itself happens in the pages, API
 * handlers and database, not here.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  const usingSupabase = process.env.DATA_BACKEND !== "local" && url && key;
  if (!usingSupabase) return NextResponse.next();

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

export const config = {
  matcher: [
    "/admin/:path*",
    "/driver/:path*",
    "/api/admin/:path*",
    "/api/driver/:path*",
    "/login",
    "/account",
  ],
};
