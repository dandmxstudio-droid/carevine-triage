import "server-only";
import {
  createHmac,
  createHash,
  timingSafeEqual,
  randomBytes,
} from "node:crypto";
export function passwordsMatch(actual: string, expected: string) {
  return timingSafeEqual(
    createHash("sha256").update(actual).digest(),
    createHash("sha256").update(expected).digest(),
  );
}
export function signAdminCookie(password: string, now = Date.now()) {
  const payload = `${now + 8 * 60 * 60 * 1000}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${createHmac("sha256", password).update(payload).digest("hex")}`;
}
export function verifyAdminCookie(
  value: string | undefined,
  password: string | undefined,
  now = Date.now(),
) {
  if (!value || !password) return false;
  const parts = value.split(".");
  if (
    parts.length !== 3 ||
    !/^\d+$/.test(parts[0]) ||
    !/^[0-9a-f]{32}$/.test(parts[1]) ||
    !/^[0-9a-f]{64}$/.test(parts[2])
  )
    return false;
  const expiry = Number(parts[0]);
  if (expiry <= now || expiry > now + 8 * 60 * 60 * 1000) return false;
  const expected = createHmac("sha256", password)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("hex");
  return passwordsMatch(parts[2], expected);
}
