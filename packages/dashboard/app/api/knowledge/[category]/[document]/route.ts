import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { getKnowledgeDocument, KnowledgeError } from "dba";
import { statusForKnowledgeError } from "@/lib/knowledge-api";

/**
 * GET /api/knowledge/[category]/[document] — a single document's name +
 * body (Story 96). Read-only; editing happens through Folders. Unknown
 * slugs give a controlled 404 (no address/repo detail leaks).
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string; document: string }> }
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { category, document } = await params;

  try {
    const view = await getKnowledgeDocument(category, document);
    return NextResponse.json({ document: view });
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
