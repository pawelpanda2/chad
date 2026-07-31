/**
 * Story 96 — Folders repo-selection guard tests: the shared `chad_shared`
 * repo is an admin-only, explicitly-listed exception; everything else
 * (other users' repos, forged GUIDs) stays denied exactly as before.
 */

import { describe, it, expect } from "vitest";
import { resolveFoldersRepoAccess, listSelectableFoldersRepos } from "./shared-repo-access.js";
import { CHAD_SHARED_REPO_GUID } from "./knowledge.js";

const admin = { repoGuid: "admin-own-repo-guid", username: "pawel_f", isAdmin: true };
const regular = { repoGuid: "regular-own-repo-guid", username: "kamil_s", isAdmin: false };

describe("resolveFoldersRepoAccess", () => {
  it("grants the session's own repo when no repo is requested (pre-Story-96 request shape)", () => {
    expect(resolveFoldersRepoAccess(regular, null)).toEqual({
      allowed: true,
      repoGuid: regular.repoGuid,
      isSharedRepo: false,
    });
    expect(resolveFoldersRepoAccess(regular, "")).toEqual({
      allowed: true,
      repoGuid: regular.repoGuid,
      isSharedRepo: false,
    });
  });

  it("grants the session's own repo when explicitly requested", () => {
    expect(resolveFoldersRepoAccess(regular, regular.repoGuid)).toMatchObject({ allowed: true });
  });

  it("grants chad_shared to an admin session", () => {
    expect(resolveFoldersRepoAccess(admin, CHAD_SHARED_REPO_GUID)).toEqual({
      allowed: true,
      repoGuid: CHAD_SHARED_REPO_GUID,
      isSharedRepo: true,
    });
  });

  it("denies chad_shared to a non-admin session", () => {
    expect(resolveFoldersRepoAccess(regular, CHAD_SHARED_REPO_GUID)).toEqual({
      allowed: false,
      reason: "FORBIDDEN_REPO",
    });
  });

  it("denies another user's repo guid — even for an admin", () => {
    expect(resolveFoldersRepoAccess(admin, regular.repoGuid)).toEqual({
      allowed: false,
      reason: "FORBIDDEN_REPO",
    });
    expect(resolveFoldersRepoAccess(regular, admin.repoGuid)).toEqual({
      allowed: false,
      reason: "FORBIDDEN_REPO",
    });
  });

  it("denies an arbitrary/forged guid", () => {
    expect(resolveFoldersRepoAccess(admin, "00000000-0000-0000-0000-000000000000")).toEqual({
      allowed: false,
      reason: "FORBIDDEN_REPO",
    });
  });
});

describe("listSelectableFoldersRepos", () => {
  it("regular user: own repo only — chad_shared and other repos never listed", () => {
    expect(listSelectableFoldersRepos(regular)).toEqual([
      { id: regular.repoGuid, name: "chad_kamil_s" },
    ]);
  });

  it("admin: own repo plus chad_shared", () => {
    expect(listSelectableFoldersRepos(admin)).toEqual([
      { id: admin.repoGuid, name: "chad_pawel_f" },
      { id: CHAD_SHARED_REPO_GUID, name: "chad_shared" },
    ]);
  });
});
