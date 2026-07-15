/**
 * Repo Access Tests
 *
 * Security tests for the strict per-user repo isolation used by the
 * dashboard's Folders tab (documentation/stories/60 — critical fix for a
 * data isolation bug where one login could see/fetch every Content
 * Provider repo, across all users and all apps).
 *
 * Exercises the pure matching logic (`pickOwnRepo`/`checkRequestedRepo`)
 * directly, with fixture repo lists standing in for the Content Provider's
 * real `GetAllReposNames` response — no network/CP dependency needed to
 * prove the isolation rule itself is correct.
 */

import { pickOwnRepo, checkRequestedRepo, extractRepoInfos, RepoAccessDeniedError, type RepoInfo } from './repo-access.js';

// A realistic mixed CP repo list: the target user's repo, another CHAD
// user's repo, and a repo belonging to a completely unrelated app.
const ALL_REPOS: RepoInfo[] = [
  { id: '21d11bdc-f1f4-44d1-b61a-3fa6b039c641', name: 'chad_pawel_f' },
  { id: '8b603669-f8e6-4224-bd78-a474998995fa', name: 'chad_kamil_s' },
  { id: 'f1a2b3c4-0000-0000-0000-000000000001', name: 'some_other_app_repo' },
];

function runTests() {
  console.log('Running Repo Access Tests...\n');
  let passed = 0;
  let failed = 0;

  function test(name: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (e) {
      console.log(`  ✗ ${name}`);
      console.log(`    Error: ${e}`);
      failed++;
    }
  }

  function assertEquals(actual: unknown, expected: unknown, message?: string) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${message || 'Assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  function assertThrowsAccessDenied(fn: () => void, message?: string) {
    try {
      fn();
    } catch (e) {
      if (e instanceof RepoAccessDeniedError) return;
      throw new Error(`${message || 'Wrong error type'}: expected RepoAccessDeniedError, got ${e}`);
    }
    throw new Error(`${message || 'Expected to throw'}: no error was thrown`);
  }

  // Test 1: pawel_f gets exactly chad_pawel_f
  test('pawel_f receives only chad_pawel_f', () => {
    const repo = pickOwnRepo(ALL_REPOS, 'pawel_f');
    assertEquals(repo, { id: '21d11bdc-f1f4-44d1-b61a-3fa6b039c641', name: 'chad_pawel_f' });
  });

  // Test 2: other CHAD repos are never returned
  test('other CHAD users\' repos are not returned', () => {
    const repo = pickOwnRepo(ALL_REPOS, 'pawel_f');
    assertEquals(repo.name === 'chad_kamil_s', false);
  });

  // Test 3: repos belonging to other apps are never returned
  test('other apps\' repos are not returned', () => {
    const repo = pickOwnRepo(ALL_REPOS, 'pawel_f');
    assertEquals(repo.name === 'some_other_app_repo', false);
  });

  // Test 4: manually passing another repo's id is denied, not silently substituted
  test('manually requesting another repo id is denied', () => {
    const own = pickOwnRepo(ALL_REPOS, 'pawel_f');
    assertThrowsAccessDenied(
      () => checkRequestedRepo(own, '8b603669-f8e6-4224-bd78-a474998995fa'),
      'Requesting kamil_s\'s repo id while logged in as pawel_f must be denied'
    );
  });

  // Test 4b: requesting the caller's own id is allowed (not a false positive deny)
  test('requesting the caller\'s own repo id is allowed', () => {
    const own = pickOwnRepo(ALL_REPOS, 'pawel_f');
    const result = checkRequestedRepo(own, own.id);
    assertEquals(result, own);
  });

  // Test 5: no matching repo -> deny, never fall back to another repo
  test('no matching repo denies access, no fallback', () => {
    assertThrowsAccessDenied(() => pickOwnRepo(ALL_REPOS, 'nobody_provisioned'));
  });

  // Test 5b: ambiguous (duplicate name) match also denies, never picks the first
  test('ambiguous (duplicate) match denies access, no first-match fallback', () => {
    const duplicated: RepoInfo[] = [
      ...ALL_REPOS,
      { id: 'zzzz-duplicate', name: 'chad_pawel_f' },
    ];
    assertThrowsAccessDenied(() => pickOwnRepo(duplicated, 'pawel_f'));
  });

  // Test 6: no username -> deny, never return the list
  test('missing username denies access (no list returned)', () => {
    assertThrowsAccessDenied(() => pickOwnRepo(ALL_REPOS, undefined));
    assertThrowsAccessDenied(() => pickOwnRepo(ALL_REPOS, null));
    assertThrowsAccessDenied(() => pickOwnRepo(ALL_REPOS, ''));
  });

  // Test 7: the error itself carries no repo names (only a fixed code)
  test('denial error payload contains no repo names', () => {
    try {
      pickOwnRepo(ALL_REPOS, 'nobody_provisioned');
      throw new Error('Expected pickOwnRepo to throw');
    } catch (e) {
      if (!(e instanceof RepoAccessDeniedError)) throw e;
      const leaked = ALL_REPOS.some((r) => e.message.includes(r.name) || e.message.includes(r.id));
      assertEquals(leaked, false, 'Error message must not contain any repo name/id');
    }
  });

  // Test: strict equality, not startsWith/includes
  test('prefix match (chad_pawel_f_extra) is not treated as a match', () => {
    const repos: RepoInfo[] = [{ id: 'x', name: 'chad_pawel_f_extra' }];
    assertThrowsAccessDenied(() => pickOwnRepo(repos, 'pawel_f'));
  });

  test('substring match (something_chad_pawel_f) is not treated as a match', () => {
    const repos: RepoInfo[] = [{ id: 'x', name: 'something_chad_pawel_f' }];
    assertThrowsAccessDenied(() => pickOwnRepo(repos, 'pawel_f'));
  });

  // extractRepoInfos: defensive shape handling (mirrors real GetAllReposNames shape)
  test('extractRepoInfos maps the raw CP invoke shape', () => {
    const raw = [
      { Body: '', Settings: { id: 'a', name: 'chad_pawel_f' } },
      { Body: '', Settings: { id: 'b' } }, // missing name -> dropped
      { Body: '', Settings: {} }, // missing both -> dropped
    ];
    assertEquals(extractRepoInfos(raw), [{ id: 'a', name: 'chad_pawel_f' }]);
  });

  test('extractRepoInfos returns empty array for a non-array response', () => {
    assertEquals(extractRepoInfos({ not: 'an array' }), []);
  });

  // Summary
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
