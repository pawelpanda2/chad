/**
 * Backend selection + shared-contract tests (no live DB required).
 * Confirms postgre and mongo are selectable via config/factory and both
 * implement ContentProviderStorage — business code always uses `entry`.
 */
import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import type { ContentProviderStorage } from "cp-core";
import { mongoStorage } from "cp-mongo";
import { postgreStorage } from "cp-postgre";
import {
  createStorageForBackend,
  getBackendKindForRepo,
  getDefaultBackendKind,
  entry,
} from "./index.js";

const STORAGE_METHODS: (keyof ContentProviderStorage)[] = [
  "GetItem",
  "GetByNames",
  "GetManyByName",
  "FindRecursively",
  "Put",
  "PostParentItem",
];

function assertImplementsContract(label: string, storage: ContentProviderStorage): void {
  for (const method of STORAGE_METHODS) {
    assert.equal(
      typeof storage[method],
      "function",
      `${label} must implement ContentProviderStorage.${method}`
    );
  }
}

const ORIGINAL = {
  CP_DEFAULT_BACKEND: process.env.CP_DEFAULT_BACKEND,
  CP_REPO_BACKEND_OVERRIDES: process.env.CP_REPO_BACKEND_OVERRIDES,
};

beforeEach(() => {
  delete process.env.CP_DEFAULT_BACKEND;
  delete process.env.CP_REPO_BACKEND_OVERRIDES;
});

afterEach(() => {
  if (ORIGINAL.CP_DEFAULT_BACKEND === undefined) delete process.env.CP_DEFAULT_BACKEND;
  else process.env.CP_DEFAULT_BACKEND = ORIGINAL.CP_DEFAULT_BACKEND;
  if (ORIGINAL.CP_REPO_BACKEND_OVERRIDES === undefined) {
    delete process.env.CP_REPO_BACKEND_OVERRIDES;
  } else {
    process.env.CP_REPO_BACKEND_OVERRIDES = ORIGINAL.CP_REPO_BACKEND_OVERRIDES;
  }
});

describe("ContentProviderStorage contract — both backends", () => {
  it("mongoStorage implements every ContentProviderStorage method", () => {
    assertImplementsContract("mongoStorage", mongoStorage);
  });

  it("postgreStorage implements every ContentProviderStorage method", () => {
    assertImplementsContract("postgreStorage", postgreStorage);
  });

  it("createStorageForBackend returns the same contract for mongo and postgre", () => {
    assertImplementsContract("factory(mongo)", createStorageForBackend("mongo"));
    assertImplementsContract("factory(postgre)", createStorageForBackend("postgre"));
    assert.equal(createStorageForBackend("mongo"), mongoStorage);
    assert.equal(createStorageForBackend("postgre"), postgreStorage);
  });
});

describe("config/router backend selection", () => {
  it("defaults to net-adapter when CP_DEFAULT_BACKEND is unset", () => {
    assert.equal(getDefaultBackendKind(), "net-adapter");
    assert.equal(getBackendKindForRepo("any-guid"), "net-adapter");
  });

  it("selects postgre via CP_DEFAULT_BACKEND without changing business entry API", () => {
    process.env.CP_DEFAULT_BACKEND = "postgre";
    assert.equal(getDefaultBackendKind(), "postgre");
    assert.equal(getBackendKindForRepo("repo-a"), "postgre");
    assertImplementsContract("entry", entry);
    assert.equal(typeof entry.GetItem, "function");
  });

  it("selects mongo via CP_DEFAULT_BACKEND — still available for the future", () => {
    process.env.CP_DEFAULT_BACKEND = "mongo";
    assert.equal(getDefaultBackendKind(), "mongo");
    assert.equal(getBackendKindForRepo("repo-a"), "mongo");
  });

  it("per-repo override can pick mongo while default is postgre", () => {
    process.env.CP_DEFAULT_BACKEND = "postgre";
    process.env.CP_REPO_BACKEND_OVERRIDES = "legacy-guid:mongo";
    assert.equal(getBackendKindForRepo("legacy-guid"), "mongo");
    assert.equal(getBackendKindForRepo("other-guid"), "postgre");
  });

  it("switching backend is config-only — entry surface is unchanged", () => {
    const surface = STORAGE_METHODS.map((m) => typeof entry[m]);
    process.env.CP_DEFAULT_BACKEND = "mongo";
    assert.deepEqual(
      STORAGE_METHODS.map((m) => typeof entry[m]),
      surface
    );
    process.env.CP_DEFAULT_BACKEND = "postgre";
    assert.deepEqual(
      STORAGE_METHODS.map((m) => typeof entry[m]),
      surface
    );
  });
});
