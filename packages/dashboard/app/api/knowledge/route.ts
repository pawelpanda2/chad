import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { listKnowledgeCategories, runWithRepoContext } from "dba";

/**
 * GET /api/knowledge — menu tiles for the Knowledge tab (Story 96, merged
 * shared+personal in the Story 109 follow-up).
 *
 * Thin adapter over dba's `listKnowledgeCategories()`: Folder children of
 * `chad_shared/knowledge` (source: "shared") followed by Folder children of
 * the current session's own `knowledge` folder (source: "personal") — wrapped
 * in `runWithRepoContext` so dba can resolve the session's own repoGuid. The
 * client never sends (and never receives) a repo id or CP address — only
 * `{slug, name, source}` triples. An absent/empty tree is a valid empty
 * state (200 + []), not an error.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const categories = await runWithRepoContext(user, () => listKnowledgeCategories());
    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
