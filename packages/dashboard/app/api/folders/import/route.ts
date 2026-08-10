/**
 * POST /api/folders/import — multipart: field `file` (.zip) + `parentLoca`
 * (slash-joined, omit or "" for repo root) + optional `repoGuid`.
 *
 * Thin adapter (Story 109, ai-docs/content-provider/zip-import.md): session,
 * upload parsing, a basic file-presence/extension/size gate, and mapping
 * `CpImportError` to HTTP. All CP import rules (ZIP structure, security,
 * atomicity, conflicts) live in `packages/content-provider`, called via
 * `dba`'s `importCpFolderFromZip` — never here.
 *
 * SECURITY: same repo-isolation rule as the other `/api/folders/*` routes —
 * `parentLoca` is only ever resolved relative to `access.repoGuid` (from
 * `resolveFoldersRepoAccess`, never trusted directly from the client's raw
 * `repoGuid` field). `access.repoGuid` is also passed to `dba` explicitly
 * as `targetRepoGuid` — a real bug once had `importCpFolderFromZip`
 * re-derive the target repo from the session instead, which made every
 * cross-repo import (e.g. into `chad_shared`) fail even when
 * `resolveFoldersRepoAccess` had already authorized it.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { toApiItem } from "@/lib/folders-api";
import { CpImportError, getItemByAddress, importCpFolderFromZip, resolveFoldersRepoAccess, runWithRepoContext } from "dba";

export const runtime = "nodejs";

/**
 * Generous route-level circuit breaker only — the authoritative size limit
 * is enforced inside cp-files' stageAndValidateZipImport (DEFAULT_IMPORT_LIMITS),
 * which this route never imports directly (layering — see zip-import.md).
 */
const ROUTE_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function statusForImportError(error: CpImportError): number {
  switch (error.code) {
    case "VALIDATION":
      return 400;
    case "PARENT_NOT_FOUND":
      return 404;
    case "PARENT_NOT_FOLDER":
    case "ROOT_NAME_CONFLICT":
      return 409;
    case "SYSTEM_FOLDER_READ_ONLY":
    case "WRITE_FORBIDDEN":
      return 403;
    case "BACKEND_NOT_SUPPORTED":
    case "NOT_CONFIGURED":
      return 503;
    default:
      return 500;
  }
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing \"file\"" }, { status: 400 });
  }
  if (!file.name.toLowerCase().endsWith(".zip")) {
    return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Uploaded file is empty" }, { status: 400 });
  }
  if (file.size > ROUTE_MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `File exceeds the ${ROUTE_MAX_UPLOAD_BYTES}-byte upload limit` }, { status: 413 });
  }

  const parentLoca = form.get("parentLoca")?.toString() ?? "";
  // Opt-in only, per zip-import.md — the Dashboard only sends this after the
  // user has been shown exactly what would be skipped (from a prior FAILED
  // attempt's validationErrors) and explicitly confirmed proceeding without it.
  const skipUnsupported = form.get("skipUnsupported")?.toString() === "true";
  const access = resolveFoldersRepoAccess(user, form.get("repoGuid")?.toString() ?? null);
  if (!access.allowed) {
    return NextResponse.json({ error: "FORBIDDEN_REPO" }, { status: 403 });
  }
  const parentAddress = parentLoca ? `${access.repoGuid}/${parentLoca}` : access.repoGuid;

  try {
    const zipBytes = Buffer.from(await file.arrayBuffer());
    const result = await runWithRepoContext(user, () =>
      importCpFolderFromZip({ parentAddress, targetRepoGuid: access.repoGuid, zipBytes, skipUnsupported })
    );
    const parent = await getItemByAddress(parentAddress);

    return NextResponse.json({
      success: true,
      createdRootAddress: result.createdRootAddress,
      createdItemCount: result.createdItemCount,
      skipped: result.skipped,
      parent: parent ? await toApiItem(parent) : null,
    });
  } catch (err) {
    if (err instanceof CpImportError) {
      return NextResponse.json(
        { error: err.code, details: err.message, validationErrors: err.validationErrors },
        { status: statusForImportError(err) }
      );
    }
    console.error("[folders import POST]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "UNKNOWN_ERROR" }, { status: 500 });
  }
}
