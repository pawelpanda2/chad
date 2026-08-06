import assert from "node:assert/strict";
import { computeHealthy, mapHealthToUiStatus } from "./beeper-auth-health.js";

assert.equal(
  computeHealthy({
    supervisorRunning: true,
    wsRunning: true,
    oplogRunning: true,
    authorizationStatus: "authorized",
    lastSyncExitCode: 0,
  }),
  true,
);

assert.equal(
  mapHealthToUiStatus({
    supervisorRunning: true,
    healthy: false,
    authorizationStatus: "token_expired",
    lastSyncExitCode: 1,
    processWasAlreadyUp: true,
    justStarted: true,
  }),
  "token expired",
);

assert.equal(
  mapHealthToUiStatus({
    supervisorRunning: true,
    healthy: true,
    authorizationStatus: "authorized",
    lastSyncExitCode: 0,
    processWasAlreadyUp: true,
    justStarted: true,
  }),
  "running",
);

assert.equal(
  mapHealthToUiStatus({
    supervisorRunning: true,
    healthy: false,
    authorizationStatus: "authorized",
    lastSyncExitCode: 1,
  }),
  "sync failed",
);

console.log("beeper-auth-health.test.ts: ok");
