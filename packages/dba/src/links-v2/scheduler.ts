/**
 * Links V2 — daily ~05:00 automatic sync. Same process-placement pattern as
 * `google-sheets/bootstrap.ts`'s worker: a `setTimeout` interval loop
 * inside the already-running Dashboard process, started once from
 * `packages/dashboard/instrumentation.ts` — no separate container.
 *
 * Unlike the Google Sheets worker (one outbox, jobs already carry their
 * own repoGuid), Links V2 has no per-repo trigger — it must actively
 * iterate every CHAD user once a day. Iterates `getUsersListBody()`
 * (`admin-users.ts`) and runs `syncLinksV2ForCurrentRepo()` per user inside
 * `runWithRepoContext(...)`, the same pattern already used by
 * `packages/dba/scripts/reconcile-google-sheets.mjs`. One user's failure
 * is caught and logged, never aborts the rest.
 */

import yaml from "js-yaml";
import { CHAD_ADMIN_REPO_GUID, getUsersListBody } from "../admin-users.js";
import { findOrCreateFolderChain, createOrGetChild, putItemBody, resolveByNames } from "../item-ops.js";
import { runWithRepoContext } from "../repo-context.js";
import { syncLinksV2ForCurrentRepo } from "./sync.js";

const SCHEDULER_STATE_FOLDER = ["links-v2"];
const SCHEDULER_STATE_ITEM = "scheduler-state";
/** Local server hour the sync becomes due — "codziennie około 05:00" per the Story 104 spec. */
const DUE_HOUR = 5;

interface SchedulerState {
  lastRunDate?: string;
}

function isSchedulerState(value: unknown): value is SchedulerState {
  return typeof value === "object" && value !== null;
}

async function readSchedulerState(): Promise<SchedulerState> {
  return runWithRepoContext({ repoGuid: CHAD_ADMIN_REPO_GUID, username: "chad_admin" }, async () => {
    const item = await resolveByNames([...SCHEDULER_STATE_FOLDER, SCHEDULER_STATE_ITEM]);
    if (!item || !item.body.trim()) return {};
    try {
      const parsed = yaml.load(item.body);
      return isSchedulerState(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });
}

async function writeSchedulerState(state: SchedulerState): Promise<void> {
  await runWithRepoContext({ repoGuid: CHAD_ADMIN_REPO_GUID, username: "chad_admin" }, async () => {
    const folder = await findOrCreateFolderChain([...SCHEDULER_STATE_FOLDER]);
    const item = await createOrGetChild(folder, SCHEDULER_STATE_ITEM, "Text", "");
    await putItemBody(item.config.address, yaml.dump(state));
  });
}

function todayLocalDate(now: Date): string {
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * Pure decision function — exported so the date-gating logic can be tested
 * directly with a fake "now"/`lastRunDate`, no real 24h wait needed. Due
 * once local hour has reached `DUE_HOUR` and no run has been recorded yet
 * today.
 */
export function isDailySyncDue(now: Date, lastRunDate: string | undefined): boolean {
  if (now.getHours() < DUE_HOUR) return false;
  return lastRunDate !== todayLocalDate(now);
}

interface UsersListUser {
  repoGuid: string;
  username: string;
  isActive?: boolean;
}

interface UsersListDoc {
  users?: UsersListUser[];
}

function isUsersListDoc(value: unknown): value is UsersListDoc {
  return typeof value === "object" && value !== null;
}

async function runForAllUsers(): Promise<void> {
  const body = await getUsersListBody();
  if (!body) {
    console.log("[links-v2-scheduler] no users-list body found — skipping run.");
    return;
  }

  let usersDoc: UsersListDoc;
  try {
    const parsed = yaml.load(body);
    usersDoc = isUsersListDoc(parsed) ? parsed : {};
  } catch (error) {
    console.error("[links-v2-scheduler] failed to parse users-list body:", error);
    return;
  }

  const users = (usersDoc.users ?? []).filter((u) => u.isActive !== false && u.repoGuid && u.username);
  console.log(`[links-v2-scheduler] daily run starting for ${users.length} user(s).`);

  for (const user of users) {
    try {
      const report = await runWithRepoContext({ repoGuid: user.repoGuid, username: user.username }, () =>
        syncLinksV2ForCurrentRepo()
      );
      console.log(
        `[links-v2-scheduler] username=${user.username} leadsScanned=${report.leadsScanned} ` +
          `newBeeperLinks=${report.newBeeperLinks} newGoogleContactsLinks=${report.newGoogleContactsLinks} ` +
          `draftLeadsCreated=${report.draftLeadsCreated.length} errors=${report.errors.length}`
      );
    } catch (error) {
      console.error(
        `[links-v2-scheduler] username=${user.username} sync failed:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

let started = false;

/**
 * Starts the daily ~05:00 Links V2 sync loop. Idempotent (a second call is
 * a no-op) and never throws — a misconfiguration degrades to "scheduler
 * not started", logged, never crashes Dashboard startup. Gated by
 * `LINKS_V2_SYNC_ENABLED` (default on; set to `"false"` to disable, e.g.
 * for tests).
 */
export function startLinksV2DailySchedulerIfEnabled(tickIntervalMs = 5 * 60 * 1000): (() => void) | null {
  if (process.env.LINKS_V2_SYNC_ENABLED === "false") {
    console.log("[links-v2-scheduler] not started — LINKS_V2_SYNC_ENABLED=false.");
    return null;
  }
  if (started) {
    console.log("[links-v2-scheduler] startLinksV2DailySchedulerIfEnabled called again — already running, ignoring.");
    return null;
  }
  started = true;
  console.log(`[links-v2-scheduler] starting (tickIntervalMs=${tickIntervalMs}, dueHour=${DUE_HOUR}).`);

  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const now = new Date();
      const state = await readSchedulerState();
      if (isDailySyncDue(now, state.lastRunDate)) {
        // Recorded before running (not after) so a crash mid-run can't
        // cause the same day to run twice on restart — sync is idempotent
        // either way (dedup by chatId/resourceName), this just avoids
        // redundant work.
        await writeSchedulerState({ lastRunDate: todayLocalDate(now) });
        await runForAllUsers();
      }
    } catch (error) {
      console.error("[links-v2-scheduler] tick failed:", error);
    }
    if (!stopped) setTimeout(tick, tickIntervalMs);
  };
  void tick();
  return () => {
    stopped = true;
  };
}
