import { afterEach, describe, expect, it } from "vitest";
import { startDataOutboxWorkerIfEnabled, stopDataOutboxWorker } from "../../../packages/dba/src/data-outbox-bootstrap.js";

describe("offline-readonly-backup — workers", () => {
  const prevMode = process.env.CHAD_DATA_MODE;
  const prevOutbox = process.env.DBA_DATA_OUTBOX_WORKER_ENABLED;

  afterEach(() => {
    stopDataOutboxWorker();
    if (prevMode === undefined) delete process.env.CHAD_DATA_MODE;
    else process.env.CHAD_DATA_MODE = prevMode;
    if (prevOutbox === undefined) delete process.env.DBA_DATA_OUTBOX_WORKER_ENABLED;
    else process.env.DBA_DATA_OUTBOX_WORKER_ENABLED = prevOutbox;
  });

  it("does not start data-outbox worker in offline-readonly-backup mode", () => {
    process.env.CHAD_DATA_MODE = "offline-readonly-backup";
    process.env.DBA_DATA_OUTBOX_WORKER_ENABLED = "true";
    const stop = startDataOutboxWorkerIfEnabled();
    expect(stop).toBeNull();
  });
});
