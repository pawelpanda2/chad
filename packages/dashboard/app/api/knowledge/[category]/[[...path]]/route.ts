/**
 * GET/PUT /api/knowledge/[category]/[[...path]] — Story 109 follow-up:
 * replaced the old fixed `[category]`/`[category]/[document]` pair.
 *
 * Real knowledge trees are not a fixed category → section → document (2
 * level) shape — some go 5+ levels deep. `path` (may be empty/omitted) is
 * an arbitrary-depth chain of slugs under the category; the resolved node
 * is either a Folder (a listing of its own children, some Folders, some
 * Text) or a Text item (a document, name+body). The client never knows
 * which kind a given URL resolves to ahead of the request, so GET always
 * calls `getKnowledgeNode` (not the type-narrowed
 * `getKnowledgeFolder`/`getKnowledgeDocument`) and returns `{node}` tagged
 * with `kind: "folder" | "document"`.
 *
 * PUT only makes sense on a document — `updateKnowledgeDocumentBody`
 * itself throws `DOCUMENT_NOT_FOUND` if the resolved node is a Folder.
 *
 * SECURITY: same as before — slugs are validated before any lookup,
 * category/personal-repo resolution never trusts a client-supplied repo id
 * or address. A "shared" (chad_shared) document is only actually saveable
 * by an admin session (`allowSharedWrite: user.isAdmin`), same admin-only
 * gate `resolveFoldersRepoAccess` already applies to chad_shared in the
 * Folders tab.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import {
  getKnowledgeNode,
  updateKnowledgeDocumentBody,
  KnowledgeError,
  KnowledgeWriteError,
  runWithRepoContext,
} from "dba";
import { statusForKnowledgeError } from "@/lib/knowledge-api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string; path?: string[] }> }
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { category, path } = await params;

  try {
    const node = await runWithRepoContext(user, () => getKnowledgeNode(category, path ?? []));
    return NextResponse.json({ node });
  } catch (err) {
    if (err instanceof KnowledgeError) {
      return NextResponse.json({ error: err.code }, { status: statusForKnowledgeError(err) });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ category: string; path?: string[] }> }
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let payload: { body?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof payload.body !== "string") {
    return NextResponse.json({ error: 'Missing or invalid "body"' }, { status: 400 });
  }

  const { category, path } = await params;

  try {
    const node = await runWithRepoContext(user, () =>
      updateKnowledgeDocumentBody(category, path ?? [], payload.body as string, { allowSharedWrite: user.isAdmin })
    );
    return NextResponse.json({ node });
  } catch (err) {
    if (err instanceof KnowledgeWriteError) {
      return NextResponse.json({ error: err.code, details: err.message }, { status: 403 });
    }
    if (err instanceof KnowledgeError) {
      return NextResponse.json({ error: err.code }, { status: statusForKnowledgeError(err) });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
