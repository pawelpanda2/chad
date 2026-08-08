/**
 * Lets a DBA caller hand cp-entry the currently-effective Postgres
 * connection URI before a write (Story 109 follow-up — found via a real
 * local-Docker smoke test, not theoretical).
 *
 * `cp-postgre`'s own client (client.ts) reads `CP_POSTGRE_URI ??
 * POSTGRES_URI` directly from the environment and caches a single
 * process-lifetime connection pool — it has no knowledge of `packages/dba`'s
 * Dev Panel Server/offline-readonly-backup override
 * (`dba/src/dev-db-override.ts`). In local Docker, `POSTGRES_URI` is set to
 * the local mirror container, while `dev-db-override.ts`'s default "server"
 * source resolves dba's OWN reads to the real QNAP Postgres — two different
 * databases. Without this, a ZIP import silently commits into whichever
 * database `cp-postgre` happened to connect to first, invisible to every
 * normal Folders read (which goes through dba's own, override-aware path).
 *
 * This does not give cp-entry generic Dev-Panel awareness — it only lets a
 * caller (`packages/dba/src/cp-import.ts`) that already knows the effective
 * URI hand it down explicitly, once, right before a write. DBA still owns
 * resolving "which environment"; cp-entry/cp-postgre still own "how to
 * execute against it".
 */
import { closePostgrePool } from "cp-postgre";

let lastUri: string | null = null;

export async function ensurePostgreConnectionUri(uri: string): Promise<void> {
  if (lastUri === uri) return;
  process.env.CP_POSTGRE_URI = uri;
  if (lastUri !== null) {
    // A pool may already be open under the previous URI — close it so the
    // next query lazily reconnects under the new one. First call in the
    // process needs no close (no pool exists yet).
    await closePostgrePool();
  }
  lastUri = uri;
}
