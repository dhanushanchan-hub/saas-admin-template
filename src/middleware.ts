import { defineMiddleware } from "astro:middleware";

import { SESSION_COOKIE, passwordConfigured, verifySession } from "@/lib/auth";

// Every page needs the Founder's login. API routes check API_TOKEN themselves,
// which is how OpenClaw, n8n and the dashboard's own components call them.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, search } = context.url;
  if (pathname === "/login" || pathname.startsWith("/api/")) return next();

  const password = context.locals.runtime.env.FOUNDER_PASSWORD?.trim();
  const session = context.cookies.get(SESSION_COOKIE)?.value;
  if (
    passwordConfigured(password) &&
    (await verifySession(password, session))
  ) {
    return next();
  }

  const nextParam =
    pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return context.redirect(`/login${nextParam}`, 302);
});
