/**
 * Structured logger that never writes PII. Log IDs and event names only;
 * as a safety net, known PII keys are dropped and email/phone-like strings
 * are redacted.
 */
type Level = "info" | "warn" | "error";

const PII_WORD =
  /(^|_)(name|email|phone|address|street|city|zip|notes|token|lat|lng|lon|ip|body|password|secret|to)s?(_|$)/;
const EMAIL_RE = /[^\s@"'<>]+@[^\s@"'<>]+\.[^\s@"'<>]+/g;
const PHONE_RE = /\+?\d[\d\s().-]{8,}\d/g;

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[depth]";
  if (typeof value === "string")
    return value.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[number]");
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (value instanceof Error) return { error: value.name, message: scrub(value.message) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isPiiKey(k) ? "[redacted]" : isUuid(v) ? v : scrub(v, depth + 1);
    }
    return out;
  }
  return value;
}

const isUuid = (v: unknown) =>
  typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function isPiiKey(key: string): boolean {
  const snake = key.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return !snake.endsWith("_id") && PII_WORD.test(snake);
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...(scrub(fields) as object),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
