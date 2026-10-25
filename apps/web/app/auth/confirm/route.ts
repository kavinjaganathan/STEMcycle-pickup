import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";

// Landing for emailed one-time password-reset links:
// verifies the token, sets the session cookie, then redirects.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  if (tokenHash && type === "recovery") {
    const { error } = await (
      await supabaseServer()
    ).auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL("/driver/account?reset=1", url.origin), 303);
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin), { status: 303 });
}
