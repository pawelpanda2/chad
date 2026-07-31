/**
 * Structured stderr logging with secret redaction (Input §1.4/§1.11 —
 * "Nie zwracaj sekretów... redakcja sekretów z logów"). Always writes to
 * stderr, never stdout — stdout is the MCP stdio transport's wire protocol
 * channel, and any stray log line there would corrupt it.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type LogLevel = keyof typeof LEVELS;

/**
 * Patterns matched against string field values before logging. Covers
 * connection strings (postgres://user:pass@host), bearer tokens, and
 * generic key=value secrets — deliberately broad (a few false positives in
 * logs are cheap; one leaked credential is not).
 */
const SECRET_PATTERNS: RegExp[] = [
  /(postgres(?:ql)?|mongodb):\/\/[^:@/\s]+:[^@/\s]+@/gi,
  /\bBearer\s+\S+/gi,
  /\b(token|password|secret|apikey|api_key)\s*[:=]\s*\S+/gi,
];

export function redact(value: string): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, (match) => {
      if (match.includes("://")) {
        // Keep the scheme/host visible, drop only credentials.
        return match.replace(/\/\/[^@]+@/, "//<redacted>@");
      }
      if (/^Bearer\s/i.test(match)) {
        return "Bearer <redacted>";
      }
      return match.split(/[:=]/)[0] + "=<redacted>";
    });
  }
  return out;
}

function redactDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return "<max-depth>";
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactDeep(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

export function createLogger(minLevel: LogLevel = "info"): Logger {
  const threshold = LEVELS[minLevel];
  const write = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (LEVELS[level] < threshold) return;
    const entry = {
      ts: new Date().toISOString(),
      level,
      msg: redact(msg),
      ...(meta ? { meta: redactDeep(meta) } : {}),
    };
    process.stderr.write(JSON.stringify(entry) + "\n");
  };
  return {
    debug: (msg, meta) => write("debug", msg, meta),
    info: (msg, meta) => write("info", msg, meta),
    warn: (msg, meta) => write("warn", msg, meta),
    error: (msg, meta) => write("error", msg, meta),
  };
}
