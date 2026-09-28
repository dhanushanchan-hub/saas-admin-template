import type { APIRoute } from "astro";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSession,
  passwordConfigured,
  safeNext,
} from "@/lib/auth";

export const POST: APIRoute = async ({
  cookies,
  locals,
  redirect,
  request,
  url,
}) => {
  const form = await request.formData().catch(() => undefined);
  const next = safeNext(form?.get("next"));
  const attempt = form?.get("password");
  const password = locals.runtime.env.FOUNDER_PASSWORD?.trim();

  if (
    !passwordConfigured(password) ||
    typeof attempt !== "string" ||
    !(await checkPassword(password, attempt.trim()))
  ) {
    return redirect(`/login?error=1&next=${encodeURIComponent(next)}`, 303);
  }

  cookies.set(SESSION_COOKIE, await createSession(password), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    maxAge: SESSION_MAX_AGE,
  });
  return redirect(next, 303);
};
