import { NextResponse } from 'next/server';
import {
  runWithRepoContext,
  resolveByNames,
  decryptSecret,
} from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * POST /api/google-sheets/reveal-password
 *
 * Decrypts the shared Google viewing-account password for the current user
 * only after an explicit reveal action. The password is never returned from
 * GET /api/google-sheets/info — that route only exposes the email + a
 * hasPassword flag. Confirmation word is enforced client-side (same pattern
 * as Forms' Clear dialog); this endpoint is the gated decrypt step.
 */
export async function POST() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ success: false, error: 'NOT_AUTHENTICATED' }, { status: 401 });
  }

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
