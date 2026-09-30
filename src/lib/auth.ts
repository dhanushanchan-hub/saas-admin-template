// Founder login for the dashboard. One password, the FOUNDER_PASSWORD secret,
// unlocks every page. API routes keep using API_TOKEN for machine clients.

export const SESSION_COOKIE = "tiva_session";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60; // seconds
export const MIN_PASSWORD_LENGTH = 16;

const encoder = new TextEncoder();

// A missing or short password keeps the dashboard locked instead of open.
export const passwordConfigured = (
  password: string | undefined,
): password is string =>
  typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;

// Constant-time comparison of equal-length byte arrays.
const bytesEqual = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
};

const digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

// Compares fixed-length digests, so neither content nor length leaks.
export const checkPassword = async (password: string, attempt: string) => {
  const [expected, given] = await Promise.all([
    digest(password),
    digest(attempt),
  ]);
  return bytesEqual(expected, given);
};

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// The signing key comes from the password, so changing FOUNDER_PASSWORD signs
// out every device.
const sign = async (password: string, payload: string) => {
  const key = await crypto.subtle.importKey(
    "raw",
    await digest(`tiva-session-v1:${password}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload),
  );
  return toBase64Url(new Uint8Array(signature));
};

// Session token: "v1.<expiry in unix seconds>.<HMAC signature>".
export const createSession = async (password: string, now = Date.now()) => {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_MAX_AGE}`;
  return `${payload}.${await sign(password, payload)}`;
};

export const verifySession = async (
  password: string,
  token: string | undefined,
  now = Date.now(),
) => {
  const [version, expires, signature, ...rest] = (token ?? "").split(".");
  if (
    version !== "v1" ||
    !/^\d+$/.test(expires ?? "") ||
    !signature ||
    rest.length > 0 ||
    Number(expires) * 1000 <= now
  ) {
    return false;
  }
  return bytesEqual(
    encoder.encode(await sign(password, `v1.${expires}`)),
    encoder.encode(signature),
  );
};

// Only same-site paths, so the login can't redirect to another website.
export const safeNext = (value: unknown) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  !value.startsWith("//") &&
  !value.startsWith("/\\") &&
  !value.startsWith("/login")
    ? value
    : "/";
