import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";
import { env } from "@/lib/env";

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
    if (!error) return NextResponse.redirect(`${env.appUrl}/driver/account?reset=1`, 303);
  }
  return NextResponse.redirect(`${env.appUrl}/login?error=link`, { status: 303 });
}
