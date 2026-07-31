import { NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { listKnowledgeCategories } from "dba";

/**
 * GET /api/knowledge — menu tiles for the Knowledge tab (Story 96).
 *
 * Thin adapter over dba's `listKnowledgeCategories()`: Folder children of
 * `chad_shared/knowledge`, in CP order. The client never sends (and never
 * receives) a repo id or CP address — only `{slug, name}` pairs. An
 * absent/empty tree is a valid empty state (200 + []), not an error.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  try {
    const categories = await listKnowledgeCategories();
    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "UNKNOWN_ERROR" },
      { status: 500 }
    );
  }
}
