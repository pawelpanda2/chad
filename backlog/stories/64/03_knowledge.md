# Story 64 — Knowledge

Pointers discovered while researching this Story, and why each one matters.

## Where the reported error actually originates (C# backend)

- `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/PathWorker.cs`
  - `GetRepoPath(repo)` looks up `repo` in `_repoModelsList` (by `Name` or GUID). If zero or
    more-than-one match is found, it calls `HandleError()`.
  - `HandleError()` (line ~145-148) is literally:
    ```csharp
    private string HandleError()
    {
        throw new InvalidOperationException();
    }
    ```
    No message, no context — this is the exact, verbatim source of the
    "Operation is not valid due to the current state of the object." the user
    reported (that string is .NET's default message for a parameterless
    `InvalidOperationException()`).
  - `GetItemPath`, `GetConfigPath`, `GetBodyPath` all call `GetRepoPath` first,
    so any failure anywhere downstream (config read, body read) can actually
    be a repo-resolution failure surfacing with zero identifying detail.

- `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/ConfigWorker.cs`
  - `GetConfigDictionary`, `GetConfigText`, `GetConfigLines` all do
    `File.ReadAllLines(configFilePath)` / `_yamlOperations.DeserializeFile(...)`
    with **no existence check and no try/catch** — a missing `config.yaml`
    throws a bare `FileNotFoundException`/`DirectoryNotFoundException` from
    the BCL, and a malformed YAML file throws whatever the YAML library
    throws, again with no domain context attached.

- `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/System/BodyWorker.cs`
  - Same pattern: `File.ReadAllLines(path)` on `body.txt` with no
    existence check, no context.

- `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/APublic/ItemWorkers/GetItemWorker.cs`
  (actually `ItemWorker.cs` — `IItemWorker.GetItem(repo, loca)`, the exact
  entry point named in the user's report) — calls into `ReadMultiWorker`,
  which (not yet fully traced in this pass, but same family) ends up calling
  `ConfigWorker`/`PathWorker`/`BodyWorker` for the actual reads.

- `packages/net-content-provider/api_charp/SharpRepoService/SharpRepoServiceProg/Workers/Validation/ValidationWorker.cs`
  — the **only** worker in this area that already does the kind of rich,
  structured error the user is asking for, e.g.
  `ValidateParentBeforeCreateChild` builds a detailed `errorMessage` string
  with repo/loca/path/invalid-folder-name baked in (see lines 93-97). This is
  a good **existing precedent** for "collect context at the point of
  failure" — but it still returns a flat string, not a structured object, and
  it's the exception rather than the rule elsewhere in this worker family.

## How an exception becomes an HTTP response (the `/invoke` pipeline)

- `packages/net-content-provider/api_charp/StringArgsResolver/Services/StringArgsResolverService.cs`
  - `Invoke(args)` → `TryRunMethod` → `TryInvoke`, which calls
    `method.Invoke(worker, parameters)` via reflection. Reflection wraps
    **any** exception thrown by the target method in a
    `System.Reflection.TargetInvocationException`; the real exception is
    `TargetInvocationException.InnerException`.
  - `TryInvoke`'s `catch (Exception e)` already builds a `BackendErrorInfo`
    (private nested class: `MessageType`, `Message`, `StackTrace`,
    `TargetSite`, `Source`, `InnerException` — one level of nesting, so it
    captures the `TargetInvocationException` **and** its one inner
    exception, e.g. `InvalidOperationException`). This is serialized to
    camelCase JSON and the result string becomes **`"error:" + json`**.
  - `TryRunMethod` returns that `"error:{...}"` string as the "successful"
    result of `Invoke()` — there's no exception thrown out of `Invoke()`
    itself for domain errors.

- `packages/net-content-provider/api_charp/SharpContainerApi/Preparers/DefaultPreparer.cs`
  - `POST /invoke` handler (`webApp.MapPost("/invoke", ...)`, line ~256):
    calls `argsService.Invoke(args)` and does `Results.Content(result,
    "application/json")` with **HTTP 200**, regardless of whether `result`
    is real JSON data or an `"error:{...}"` string. A *transport*-level
    exception (one that escapes `TryInvoke`'s own catch, essentially
    impossible given how it's written, but present as a safety net) is
    caught separately here and returned as a proper HTTP 500 with its own
    `{ error: { exceptionType, message, stackTrace, innerException } }`
    shape — **a second, slightly different error JSON shape** from the same
    endpoint, depending on which layer catches the exception.
  - **Consequence:** every domain-level error (repo not found, config
    missing, body missing, validation failure) comes back as **HTTP 200**
    with a body that starts with the literal text `error:` followed by JSON
    — which is *not itself valid JSON* (a bare word followed by an object
    literal). Any caller that does `JSON.parse(responseText)` without first
    checking for this prefix will get a parse error, not the actual error
    info.

## The existing "error:" prefix protocol already has a consumer — but only in Blazor, not in Next.js

- `packages/net-content-provider/front_blazor/BackendAdapters/Workers/BackendAdapter.cs`
  — `CheckForBackendError()` (line ~98) already does exactly the right
  thing: checks `response.StartsWith("error:")`, strips the prefix,
  `JsonSerializer.Deserialize<BackendErrorInfo>(...)`, and hands it to
  `IBackendErrorLogger`.
- `packages/net-content-provider/front_blazor/BackendAdapters/DevLogs/IBackendErrorLogger.cs`
  — defines the **client-side** `BackendErrorInfo` model (independent class,
  same wire shape: `MessageType`, `Message`, `StackTrace`, `TargetSite`,
  `Source`, `InnerException`).
- `packages/net-content-provider/front_blazor/BlazorApp/Services/BackendErrorFormatter.cs`
  — `Format()` walks the `InnerException` chain via `IsWrapperException()`
  (a hardcoded list: `TargetInvocationException`, `AggregateException`,
  `TaskCanceledException`, `TaskAwaiter`, `Win32Exception`) to find the
  **real** (non-wrapper) exception, then does regex-based best-effort
  extraction: file path from the message, file/line from the stack trace,
  a call chain from stack frames, and a "likely cause" guess from a fixed
  table of regexes (`Read-only file system` → Docker/Dropbox mount issue,
  `Could not find file` → missing body.txt, etc. — see
  `packages/net-content-provider/architecture/features/devlogs-human-readable-backend-errors.md`,
  which documents this exact feature, built 2026-06-29).
  - **This is the direct architectural precedent for what the user is
    asking for** — but it works by *guessing* from a generic exception
    message/stack trace after the fact, not by the failing worker recording
    *known facts* (resolved path, directory-exists, config-found, etc.) at
    the moment of failure. The user is explicitly asking to go one level
    deeper than this existing pattern (see Input 1: "Nie chcę tylko lepszego
    komunikatu tekstowego").

- **`packages/dba/src/client.ts` (the Next.js/chad-dba side) does NOT have
  any equivalent of `CheckForBackendError`.** `invokeContentProvider()`
  just does `JSON.parse(text)` on the raw response body; since
  `"error:{...}"` is not valid JSON, this throws
  `"Failed to parse JSON response.\nArgs: ...\nRaw response: ..."` — the
  entire `BackendErrorInfo` payload the C# backend already built (including
  the unwrapped inner exception, message, stack trace) is present in that
  raw text but is **never parsed or unwrapped** on the dashboard side. This
  is very likely why the user only ever sees the generic wrapper text
  (`TargetInvocationException` / `InvalidOperationException` / stack trace)
  in the dashboard today — the dashboard is currently *worse off* than the
  Blazor app at surfacing the very same backend payload, because nothing on
  this side ports `CheckForBackendError`/`BackendErrorFormatter`'s logic.

## Dashboard Dev Panel (the presentation target named in the request)

- `documentation/dashboard/common/features/dev-panel.md` — full architecture
  doc for the existing Dev Panel (ported from the Blazor
  `DevErrorPanel.razor`). Already has a `Requests` tab and an `Errors` tab,
  request/response tracing (`_traces` / `cpCalls` in API responses), and a
  documented `Error Sources` table (`Content Provider`, `chad-dba`, `Next.js`,
  `UI`).
- `packages/dashboard/lib/dev-panel/dev-panel-store.tsx` — `DevPanelError` /
  `DevPanelRequest` shape (max 200 errors / 100 requests kept in memory).
- `packages/dashboard/lib/dev-panel/dev-panel-fetch.ts` —
  `extractServerTracesFromResponseBody()` already parses `_traces` and
  `cpCalls` arrays out of API route JSON responses and turns failed traces
  into `DevPanelError` entries with `source: 'Content Provider'` or
  `'chad-dba'`. This is the natural place to also surface a new structured
  `diagnostic` field once it exists.
- `documentation/dashboard/common/features/compile-time-flags-and-error-box.md`
  — **the existing dev/prod gating mechanism** to reuse, not reinvent:
  `lib/flags.ts` (`DEV_PANEL_ENABLED`, `DIAGNOSTICS_ENABLED`, both
  `NEXT_PUBLIC_*` build-time flags, default ON in `next dev`, OFF in Docker
  prod builds unless explicitly overridden), and the shared `<ErrorBox
  message details />` component (`details` only rendered when
  `DIAGNOSTICS_ENABLED` and the user expands it). This doc also records a
  **real prior incident** (2026-07-13): a `debug` payload leaked a user list
  on PROD's login error box before this gating existed — directly relevant
  precedent for why any new `DiagnosticInfo` fields that reveal filesystem
  paths or file contents must be gated at least this carefully, and
  arguably gated server-side too (see `02_plan.md`).

## Content Provider domain rules (for validating what "Validation: Address mismatch" should mean)

- `documentation/content-provider/frequent-bugs.md` — canonical rules: item
  folders must be 2-3 digit numeric names, `content/` folders are forbidden,
  domain data belongs in `body.yaml`/`body.json` not `config.yaml`,
  `config.yaml` holds only technical metadata (`id`, `type`, `name`,
  `address`, `primaryBody`, ...).
- `ValidationWorker.cs` (see above) already validates "child folders must be
  numeric" and "Put target loca must be numeric" — i.e. there is already a
  notion of an `address` field in `config.yaml` that should match the
  physical numeric path, which is exactly the "Expected vs Actual address"
  example in the user's mockup.

## Story-standard mechanics used for this Story

- `documentation/ai-docs/begin_here/03_story-standard.md` — story folders
  live at `backlog/stories/<N>/` (not `documentation/stories/<N>/`, per the
  2026-07-16 location-note at the top of that file). Next free number was
  `64` (`53`...`63` already exist; `63` itself is mid-flight with only
  `01_input.md`-`04_todos.md`, matching this Story's own state: plan only,
  no implementation, no `05_tasks_and_checklist.md` yet).
