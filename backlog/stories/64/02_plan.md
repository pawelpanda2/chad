# Story 64 — Plan: structured diagnostic model for Content Provider errors

**Status: proposal only. Nothing in this Story has been implemented.** Per
Input 1, this document is for approval before any code changes.

## 1. Problem, restated

Content Provider errors currently surface as a generic wrapper
(`TargetInvocationException`) around a generic domain exception
(`InvalidOperationException`, thrown with **no message at all** — see
`PathWorker.HandleError()` in `03_knowledge.md`), plus a raw stack trace.
None of that tells you *which* repo/loca was being resolved, what path was
built, or which specific thing was missing (directory, `config.yaml`,
`body.txt`) or wrong (address mismatch). Today, on the dashboard side, it's
actually worse than that: `chad-dba`'s `client.ts` doesn't even parse the
`"error:{...}"` payload the backend already sends, so the dashboard shows a
generic "Failed to parse JSON response" instead of the (already-present but
unparsed) exception details. See `03_knowledge.md` for the full trace of
both problems through the code.

## 2. Goals

1. Every failure in the address-resolution / read path (`PathWorker`,
   `ConfigWorker`, `BodyWorker`, `ValidationWorker`, `ItemWorker`) carries a
   **structured `DiagnosticInfo` object**, populated with concrete, known
   facts **at the point of failure** — not reconstructed afterwards by
   guessing from a message string.
2. That `DiagnosticInfo` travels over the existing `/invoke` wire protocol
   **additively** — no breaking change to the JSON shape the Blazor app
   already parses.
3. The Next.js dashboard actually parses today's (and this Story's
   extended) error payload — this alone fixes a real, currently-broken gap,
   independent of the new model.
4. The Dashboard Dev Panel renders the structured diagnostic in the format
   sketched in Input 1 (Repo / Loca / Resolved path / Directory exists /
   config.yaml found+content / body found / Validation expected vs actual),
   gated the same way existing sensitive dev-only data already is.
5. Sensitive data (absolute filesystem paths, file contents) never reaches
   a non-dev build, consistent with the 2026-07-13 incident already on
   record (`03_knowledge.md`).

## 3. Non-goals

- Rewriting `PathWorker`/`ConfigWorker` internals beyond what's needed to
  attach diagnostics at the existing failure points. No behavior change to
  successful calls.
- Building the regex/"likely cause" guessing layer the Blazor app already
  has (`BackendErrorFormatter`) — that stays as-is for Blazor; the new
  model supersedes the *need* for it in future dashboard-side code, but
  this Story doesn't touch Blazor.
- A generalized logging/observability pipeline (e.g. shipping diagnostics
  to an external log aggregator). Out of scope — this is about one
  request's error response, not history.

## 4. Proposed architecture

### 4.1 `DiagnosticInfo` — a dedicated model, not just a better string

A new C# class in `SharpRepoServiceProg` (proposed location:
`Workers/System/Diagnostics/DiagnosticInfo.cs`, new folder alongside the
existing `Workers/System/` workers it describes):

```csharp
public class DiagnosticInfo
{
    // Where in the code this was collected — helps distinguish "repo
    // resolution failed" from "config read failed" from "validation failed"
    // without parsing the message.
    public string Step { get; set; }              // e.g. "PathWorker.GetRepoPath"

    // The raw address that was being resolved.
    public string? Repo { get; set; }
    public string? Loca { get; set; }

    // What GetRepoPath/GetItemPath actually built, and whether repo
    // resolution itself succeeded (everything below is only meaningful if
    // this is true).
    public bool RepoResolved { get; set; }
    public string? ResolvedRepoPath { get; set; }
    public string? ResolvedItemPath { get; set; }

    public bool? DirectoryExists { get; set; }

    public string? ConfigPath { get; set; }
    public bool? ConfigExists { get; set; }
    public string? ConfigContent { get; set; }     // gated, see 4.4
    public string? ConfigParseError { get; set; }

    public string? BodyPath { get; set; }
    public bool? BodyExists { get; set; }

    // Populated only for ValidationWorker-style address mismatches.
    public string? ValidationRule { get; set; }        // e.g. "AddressMustMatchResolvedPath"
    public string? ExpectedAddress { get; set; }
    public string? ActualAddress { get; set; }
}
```

Every field is nullable/optional by design: a repo-not-found diagnostic
never gets to fill in `ConfigExists`, and that's fine — the Dev Panel
renders whatever is present (mirrors the "NOT FOUND" / early-exit examples
in Input 1).

This class lives in the same project as the workers that populate it
(`SharpRepoServiceProg`), so no new project/assembly reference is needed.

### 4.2 Domain exceptions — yes, replace the bare `InvalidOperationException`

A small exception hierarchy, all carrying a `DiagnosticInfo`:

```csharp
public abstract class ContentProviderException : Exception
{
    public DiagnosticInfo Diagnostic { get; }
    protected ContentProviderException(string message, DiagnosticInfo diagnostic)
        : base(message) { Diagnostic = diagnostic; }
}

public class RepoNotFoundException : ContentProviderException { ... }
public class ConfigNotFoundException : ContentProviderException { ... }
public class ConfigParseException : ContentProviderException { ... }
public class BodyNotFoundException : ContentProviderException { ... }
public class AddressMismatchException : ContentProviderException { ... }
```

Concretely, this replaces call sites like:

- `PathWorker.HandleError()` → `RepoNotFoundException`, message like
  `"Repo '03/06' not found (0 matches among N known repos)."`, diagnostic
  with `Step="PathWorker.GetRepoPath"`, `Repo`, `RepoResolved=false`.
- `ConfigWorker.GetConfigDictionary`/`GetConfigText`/`GetConfigLines` — wrap
  the existing `File.ReadAllLines`/`DeserializeFile` calls: check
  `Directory.Exists`/`File.Exists` first (or catch `FileNotFoundException`/
  `DirectoryNotFoundException` and rethrow as `ConfigNotFoundException`),
  and catch the YAML library's own parse exception and rethrow as
  `ConfigParseException` with `ConfigContent` = the raw file text (subject
  to the gating in 4.4) and `ConfigParseError` = the original parser
  message.
- `BodyWorker.GetBody`/`GetTextLines` — same pattern, `BodyNotFoundException`.
- A new validation check (or an extension of `ValidationWorker`) comparing
  `config.yaml`'s `address` field against the actual resolved numeric path
  — `AddressMismatchException`, matching the exact "Expected/Actual" shape
  in Input 1. (`ValidationWorker` already has the numeric-folder-name
  validation this would sit next to; see `03_knowledge.md`.)

Why domain exceptions and not just "populate a diagnostic object and keep
throwing `InvalidOperationException`": the reflection-based `/invoke`
dispatch (`StringArgsResolverService.TryInvoke`) only sees `Exception`, so
technically either approach could work at the wire-serialization boundary.
But domain exceptions give (a) a stable, greppable type name in
`MessageType`/`ExceptionType` for anyone reading logs or the Dev Panel,
(b) a compile-time-enforced place to attach `Diagnostic` (a property on the
base class, not a loose out-parameter or ambient field), and (c) a single
place (the base class) to plug into the serialization step described next,
rather than type-sniffing `InvalidOperationException` instances by message
content. This also matches what the user asked to evaluate directly
("czy zamiast rzucania `InvalidOperationException` powinny powstać własne
wyjątki domenowe" — yes).

Existing `catch { }` sites (e.g. `ConfigWorker.CreateConfigKey`, line
~143-148) are unaffected — they swallow `Exception` generally and don't
need to change.

### 4.3 Wire format — additive only

`StringArgsResolverService.TryInvoke`'s private `BackendErrorInfo` (the
class that gets serialized after the `"error:"` prefix) gets **one new
optional field**:

```csharp
private class BackendErrorInfo
{
    public string MessageType { get; set; }
    public string Message { get; set; }
    public string? StackTrace { get; set; }
    public string? TargetSite { get; set; }
    public string? Source { get; set; }
    public BackendErrorInfo? InnerException { get; set; }
    public DiagnosticInfo? Diagnostic { get; set; }   // NEW
}
```

`Diagnostic` is populated by walking the exception chain the same way
Blazor's `BackendErrorFormatter.IsWrapperException`/`FindRealError` already
does (`TargetInvocationException`, `AggregateException`, etc. are
transparent wrappers) until either a `ContentProviderException` is found
(use its `.Diagnostic`) or the chain ends (leave `Diagnostic` null — a
"boring" exception like an out-of-memory error has nothing new to add).

This is a pure addition to an existing JSON object. `System.Text.Json`
(used both server-side to serialize and Blazor-side to deserialize via
`JsonSerializer.Deserialize<BackendErrorInfo>`) ignores unknown/extra
properties by default in both directions — the Blazor app's own
`BackendErrorInfo` class (in `BackendAdapters.DevLogs`) simply won't have a
`Diagnostic` property and will silently ignore it. **No Blazor code needs
to change for this Story**, and the `"error:" + json`-with-HTTP-200
transport convention itself is left exactly as-is (changing that would be
a much bigger, riskier compatibility break affecting both frontends at
once, for no benefit this Story needs).

### 4.4 What's safe to show only in DEV

Two categories of sensitivity, gated independently:

- **Absolute filesystem paths** (`ResolvedRepoPath`, `ResolvedItemPath`,
  `ConfigPath`, `BodyPath`) — reveal server directory layout (e.g.
  `/share/dropbox/repos/...`, matching the QNAP/Dropbox mount conventions
  already used in this project). Moderate sensitivity.
- **File contents** (`ConfigContent`) — reveals actual repo data (item
  names, structure, potentially user-entered content depending on what
  lives in `config.yaml`). Higher sensitivity — this is the same category
  of leak as the 2026-07-13 login-panel incident (`03_knowledge.md`), just
  a different payload.

Proposed two-layer gating, defense in depth (don't rely on only one side
remembering to gate it):

1. **Server-side (Content Provider API):** a config flag, e.g.
   `Diagnostics:IncludeSensitiveDetails` (appsettings / env var), read once
   at startup next to the existing `ConfigNames.NoSqlRepoSearchPaths`
   pattern already in `DefaultPreparer`. When `false` (the prod/QNAP-prod
   default), `ConfigContent` is omitted entirely from the JSON (not just
   hidden client-side) and paths are either omitted or reduced to a
   relative form (e.g. path relative to the resolved repo root, so you
   still get "Directory exists: NO" and "config.yaml: NOT FOUND" without
   leaking `/share/dropbox/...`). When `true` (local dev, and optionally
   the QNAP **test** environment), everything is included. Non-path,
   non-content facts (`RepoResolved`, `DirectoryExists`, `ConfigExists`,
   `BodyExists`, `ValidationRule`/`Expected`/`Actual`) are booleans/short
   strings that don't leak filesystem layout or content — these are always
   included, in every environment, because they're exactly the actionable
   "what's wrong" signal this whole Story exists for, and withholding them
   on test/prod would defeat the point of the feature there too.
2. **Client-side (dashboard):** the existing `DIAGNOSTICS_ENABLED` flag
   (`lib/flags.ts`) continues to gate whether the Dev Panel/`ErrorBox`
   *renders* the sensitive fields at all, exactly like it already gates
   stack traces today. This is unchanged from the existing pattern — no new
   flag needed on the dashboard side, `Diagnostic.ConfigContent`/paths
   simply become new fields shown under the same `+`-to-expand gate that
   already exists.

This means even if a future change accidentally flips `DIAGNOSTICS_ENABLED`
on in a prod build, the sensitive fields still won't be *in* the response
unless the CP server itself is also configured for it — matching how
seriously this codebase already treats this exact failure mode.

### 4.5 The immediately-broken link: `chad-dba` doesn't parse `"error:"` at all

Independent of the new `DiagnosticInfo` model, `packages/dba/src/client.ts`
needs the equivalent of Blazor's `CheckForBackendError`/
`BackendErrorFormatter.FindRealError`, because right now it silently
discards the entire `BackendErrorInfo` payload the backend already sends
today (see `03_knowledge.md`). Proposed:

- New module `packages/dba/src/backend-error.ts`:
  - `BackendErrorInfo` TS interface (mirrors the C# JSON shape, including
    the new optional `diagnostic` field).
  - `isWrapperExceptionType(type: string): boolean` — same hardcoded list
    as Blazor's `IsWrapperException` (`TargetInvocationException`,
    `AggregateException`, `TaskCanceledException`, ...), kept in one place
    so both frontends' notion of "not a real error, just a wrapper" doesn't
    silently drift apart over time.
  - `findRealError(info: BackendErrorInfo): BackendErrorInfo` — walks
    `.innerException` past wrapper types, same as Blazor's `FindRealError`.
  - `parseBackendError(responseText: string): ContentProviderError | null`
    — returns `null` if `responseText` doesn't start with `"error:"`
    (normal case), otherwise strips the prefix, parses the JSON, and
    builds a `ContentProviderError`.
  - `ContentProviderError extends Error` — `.info` (full `BackendErrorInfo`
    chain), `.diagnostic` (the real error's `Diagnostic`, if any),
    `.message` set to the **unwrapped real error's** message (so
    `error.message` alone is already useful, instead of
    "Exception has been thrown by the target of an invocation.").
- `invokeContentProvider()` in `client.ts` calls `parseBackendError(text)`
  **before** attempting `JSON.parse(text)` for the success path (since
  `"error:{...}"` is never valid JSON and would otherwise always fall into
  the existing "Failed to parse JSON response" branch first). On a
  non-null result, throw the `ContentProviderError` and emit a trace whose
  `.error` is the unwrapped message (today's `createTrace(...).error` is
  set to a fixed generic string per branch — this becomes the real message
  instead).
- Every existing API route's own `catch (error) { return
  NextResponse.json({ error: error.message }, { status: 500 }) }` pattern
  (there are many, per-route) benefits automatically, with zero per-route
  changes, because `error.message` is now the real unwrapped message.

### 4.6 Dev Panel presentation

- `packages/dashboard/lib/dev-panel/dev-panel-store.tsx` — extend
  `DevPanelError` with an optional `diagnostic?: DiagnosticInfo` field
  (TS type mirrored from 4.5/4.1).
- `packages/dashboard/lib/dev-panel/dev-panel-fetch.ts` —
  `extractServerTracesFromResponseBody` already special-cases failed
  traces; once `chad-dba` traces carry a real `ContentProviderError`,
  thread `.diagnostic` through into the `addError(...)` call.
- `packages/dashboard/components/dev-panel/dev-panel.tsx` — new rendering
  block in the Errors tab, laid out per Input 1's mockup: label/value pairs
  in a fixed order (`Repo`, `Loca`, `Resolved path`, `Directory exists`,
  `config.yaml` [FOUND/NOT FOUND], `config.yaml content` [if present],
  `body` [FOUND/NOT FOUND], and — only when `ExpectedAddress`/
  `ActualAddress` are present — a `Validation: Address mismatch` /
  `Expected` / `Actual` section). Falls back to today's raw
  message/stack-trace view when `diagnostic` is absent (e.g. errors that
  aren't `ContentProviderException`s). Gated by `DIAGNOSTICS_ENABLED` per
  4.4.

### 4.7 Compatibility summary

| Layer | Change | Breaking? |
|---|---|---|
| `/invoke` transport (`"error:" + json`, HTTP 200) | none | no |
| `BackendErrorInfo` JSON shape | +1 optional field (`diagnostic`) | no (additive) |
| Blazor `BackendAdapter`/`BackendErrorFormatter` | none required | no |
| `PathWorker`/`ConfigWorker`/`BodyWorker` public method signatures | none | no |
| Exceptions thrown by those workers | type changes (still `Exception`-derived) from generic BCL/`InvalidOperationException()` to domain types | callers doing `catch (InvalidOperationException)` specifically would break — grepped, none found in this codebase; `catch (Exception)`/bare `catch {}` sites are unaffected |
| `chad-dba` `client.ts` | new error-parsing branch before JSON.parse | no (previously-unparseable errors now parse; previously-successful JSON responses unaffected since they never start with `"error:"`) |
| Dashboard Dev Panel | new optional rendering block | no (renders old-style errors exactly as before when `diagnostic` is absent) |

## 5. Open questions for the user (not blocking documentation, but worth a decision before implementation starts)

1. Should the QNAP **test** environment (`test.chad.biz.pl`, per existing
   memory of the QNAP port convention) get `Diagnostics:IncludeSensitiveDetails=true`
   like local dev, or stay `false` like prod? Proposal: `true` for test,
   `false` for prod — test is already understood in this project as a
   pre-prod diagnostic environment, not public-facing data.
2. Should `AddressMismatchException`/the address-vs-path validation be a
   new check added to `ValidationWorker` now, or deferred to a later Story
   once the base `DiagnosticInfo`/exception plumbing is in place and
   proven? Proposal: implement the plumbing + `RepoNotFoundException`/
   `ConfigNotFoundException`/`BodyNotFoundException` first (these map
   directly to the reported bug and Input 1's primary examples), and treat
   the address-mismatch validation as a fast-follow using the same
   `DiagnosticInfo` shape, since it's the same infrastructure either way.

## 6. Suggested implementation order (for the next approved phase, not started)

1. `DiagnosticInfo` model + `ContentProviderException` hierarchy (backend,
   no call-site changes yet — additive, unused).
2. Wire the new exceptions into `PathWorker.HandleError`,
   `ConfigWorker`'s read paths, `BodyWorker`'s read paths. Extend
   `BackendErrorInfo`/`TryInvoke` to serialize `Diagnostic`.
3. Server-side sensitivity gating (`Diagnostics:IncludeSensitiveDetails`).
4. `packages/dba/src/backend-error.ts` + `client.ts` integration (fixes the
   currently-broken parsing gap on its own, independent of steps 1-3).
5. Dashboard Dev Panel rendering (`dev-panel-store.tsx`,
   `dev-panel-fetch.ts`, `dev-panel.tsx`).
6. (Fast-follow, per open question 2) `AddressMismatchException` +
   validation check.

Each phase is independently testable and shippable; nothing here requires
all six to land together.
