import { z } from "zod";
import { errorResponse, json, parseBody } from "@/lib/api";
import { signInDriver } from "@/lib/auth";
import { getRepo } from "@/lib/db";
import { clientIp, rateKey } from "@/lib/security";

const schema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const repo = await getRepo();
    if (!(await repo.rateLimitHit(rateKey("login-ip", clientIp(request.headers)), 600, 10))) {
      return json({ error: "Too many attempts. Please wait a few minutes." }, 429);
    }
    const { email, password } = await parseBody(request, schema);
    if (!(await signInDriver(email, password))) {
      return json(
        {
          error: "Email or password is incorrect.",
        },
        400,
      );
    }
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
