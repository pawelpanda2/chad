#!/usr/bin/env node
// Regression: CHAD's own Mongo runtime (chad-mongodb — cp_items/cp_history)
// must never come back, even accidentally (2026-07-27 full removal — see
// ai-docs/databases/red-rules.md). Static/config-based checks — no live DB
// needed, so this runs anywhere, fast, as part of every commit.
//
// Deliberately does NOT check for the string "mongo" broadly — beeper-mongodb
// is a real, intentional, active Mongo. These checks are specifically about
// CHAD's cp_items/cp_history/login backend never routing to Mongo again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "../../../..");

function read(relPath) {
  return readFileSync(path.join(REPO_ROOT, relPath), "utf8");
}

test("docker-compose.qnap.shared.yml has no chad-mongodb (or mongo-keyfile-init/mongo-rs-init) service", () => {
  const compose = read("docker-compose.qnap.shared.yml");
  assert.doesNotMatch(compose, /container_name:\s*chad-mongodb\b/);
  assert.doesNotMatch(compose, /container_name:\s*chad-mongo-keyfile-init\b/);
  assert.doesNotMatch(compose, /container_name:\s*chad-mongo-rs-init\b/);
  // beeper-mongodb must still be present and untouched.
  assert.match(compose, /container_name:\s*beeper-mongodb\b/);
  assert.match(compose, /container_name:\s*chad-postgres\b/);
});

test("the TEST/PROD dashboard compose has no CHAD MONGODB_URI, and DBA_MONGO_ENABLED is false", () => {
  const compose = read("docker-compose.server1.test-prod.dashboard.yml");
  assert.doesNotMatch(
    compose,
    /^\s*-\s*MONGODB_URI=/m,
    "dashboard compose must never wire a CHAD Mongo connection string (BEEPER_MONGODB_URI is fine)"
  );
  assert.match(compose, /^\s*-\s*DBA_MONGO_ENABLED=false\s*$/m);
  assert.match(compose, /^\s*-\s*DBA_PRIMARY_BACKEND=postgres\s*$/m);
  // Beeper's own Mongo URI must still be wired (this is not "no Mongo at all",
  // just "no CHAD Mongo").
  assert.match(compose, /BEEPER_MONGODB_URI=/);
});

test("docker-compose.local.yml's dashboard service never sets DBA_PRIMARY_BACKEND=mongo", () => {
  const compose = read("docker-compose.local.yml");
  assert.doesNotMatch(compose, /DBA_PRIMARY_BACKEND=\$\{DBA_PRIMARY_BACKEND:-mongo\}/);
  assert.doesNotMatch(compose, /^\s*-\s*DBA_PRIMARY_BACKEND=mongo\s*$/m);
});

test("bash-scripts/common/lib.sh's shared-services healthcheck no longer requires chad-mongodb", () => {
  const lib = read("bash-scripts/common/lib.sh");
  const fnMatch = lib.match(/require_shared_services_healthy\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fnMatch, "require_shared_services_healthy() function not found");
  assert.doesNotMatch(fnMatch[0], /chad-mongodb/);
  assert.match(fnMatch[0], /beeper-mongodb/);
});

test(".env.qnap.example does not present MONGO_ROOT_USERNAME/PASSWORD as an active (uncommented) CHAD Mongo credential", () => {
  const example = read(".env.qnap.example");
  assert.doesNotMatch(example, /^MONGO_ROOT_USERNAME=/m);
  assert.doesNotMatch(example, /^MONGO_ROOT_PASSWORD=/m);
  // Beeper's own credentials must still be active.
  assert.match(example, /^BEEPER_MONGO_ROOT_USERNAME=/m);
  assert.match(example, /^BEEPER_MONGO_ROOT_PASSWORD=/m);
});

test("packages/dashboard/lib/user-service.ts's login path is documented as backend-agnostic, not hardcoded to Mongo", () => {
  const source = read("packages/dashboard/lib/user-service.ts");
  assert.doesNotMatch(source, /Mongo-backed/);
});

test("the Dev Panel's Beeper block resolves via describeEffectiveBeeperMongoTarget, never describeEffectiveMongoTarget (CHAD's legacy resolver)", () => {
  const route = read("packages/dashboard/app/api/dev-settings/db-source/route.ts");
  assert.match(route, /describeEffectiveBeeperMongoTarget/);
  assert.doesNotMatch(route, /describeEffectiveMongoTarget\(/);
});

test("the Dev Panel's CHAD Postgres change-options never include a Mongo choice", () => {
  const route = read("packages/dashboard/app/api/dev-settings/db-source/route.ts");
  const optionsMatch = route.match(/options:\s*\[([^\]]*)\]/);
  assert.ok(optionsMatch, "changeOptions.options array not found");
  assert.doesNotMatch(optionsMatch[1], /mongo/i);
});
