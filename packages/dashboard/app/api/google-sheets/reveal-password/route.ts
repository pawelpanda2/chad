import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  runWithRepoContext,
  resolveByNames,
  decryptSecret,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';
import { findUserByUsername } from '@/lib/user-service';

/**
 * POST /api/google-sheets/reveal-password
 *
 * Decrypts the shared Google viewing-account password for the current user
 * only after an explicit reveal action. The password is never returned from
 * GET /api/google-sheets/info — that route only exposes the email + a
 * hasPassword flag.
 *
 * 2026-07-28 P0 fix: a client-side "type a random word" confirmation (the
 * previous gate) proves nothing about who is actually calling this
 * endpoint — a valid session cookie was already sufficient to decrypt the
 * shared secret. Now requires re-submitting the caller's own current
 * account password (verified server-side against their real passwordHash,
 * same bcrypt check as login), plus a simple per-user rate limit. Every
 * reveal attempt is logged (username + outcome), never the password.
 */

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const attemptsByUsername = new Map<string, number[]>();

function isRateLimited(username: string): boolean {
  const now = Date.now();
  const attempts = (attemptsByUsername.get(username) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  attemptsByUsername.set(username, attempts);
  return attempts.length >= RATE_LIMIT_MAX_ATTEMPTS;
}

function recordAttempt(username: string): void {
  const attempts = attemptsByUsername.get(username) || [];
  attempts.push(Date.now());
  attemptsByUsername.set(username, attempts);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

  if (isRateLimited(user.username)) {
    console.warn(`[google-sheets/reveal-password] rate limited: ${user.username}`);
    return NextResponse.json({ success: false, error: 'RATE_LIMITED' }, { status: 429 });
  }

  let currentPassword: unknown;
  try {
    ({ currentPassword } = await request.json());
  } catch {
    currentPassword = undefined;
  }
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return NextResponse.json({ success: false, error: 'REAUTH_REQUIRED' }, { status: 403 });
  }

  recordAttempt(user.username);
  const account = await findUserByUsername(user.username);
  const reauthOk = account ? await bcrypt.compare(currentPassword, account.passwordHash) : false;
  if (!reauthOk) {
    console.warn(`[google-sheets/reveal-password] reauth failed: ${user.username}`);
    return NextResponse.json({ success: false, error: 'REAUTH_FAILED' }, { status: 403 });
  }
  console.log(`[google-sheets/reveal-password] reveal granted: ${user.username}`);

  // Env override (plaintext) — rare; still only returned via this reveal path.
  const envPassword = process.env.GOOGLE_SHEETS_VIEWER_ACCOUNT_PASSWORD || null;
  if (envPassword) {
    return NextResponse.json({ success: true, data: { password: envPassword } });
  }

  try {
    const secretsItem = await runWithRepoContext(
      { repoGuid: user.repoGuid, username: user.username },
      async () => resolveByNames(['secrets'])
    );
    const body = typeof secretsItem?.body === 'string' ? secretsItem.body : '';
    const passMatch = body.match(/^pass:\s*(.+)$/m);
    if (!passMatch?.[1]) {
      return NextResponse.json({ success: false, error: 'NO_PASSWORD_CONFIGURED' }, { status: 404 });
    }
    const password = decryptSecret(passMatch[1].trim());
    return NextResponse.json({ success: true, data: { password } });
  } catch (err) {
    console.warn('[google-sheets/reveal-password] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ success: false, error: 'REVEAL_FAILED' }, { status: 500 });
  }
}
