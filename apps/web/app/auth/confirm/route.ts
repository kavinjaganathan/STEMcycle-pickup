import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";

// Landing for emailed one-time links (email confirmation, password reset):
// verifies the token, sets the session cookie, then redirects.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && (type === "signup" || type === "recovery")) {
    const { error } = await (
      await supabaseServer()
    ).auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const next = type === "recovery" ? "/driver/account?reset=1" : "/driver";
      return NextResponse.redirect(new URL(next, url.origin), { status: 303 });
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin), { status: 303 });
}
