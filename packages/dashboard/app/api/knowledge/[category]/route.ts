import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromCookies } from "@/lib/session";
import { getKnowledgeCategory, KnowledgeError } from "dba";
import { statusForKnowledgeError } from "@/lib/knowledge-api";

/**
 * GET /api/knowledge/[category] — one category's sections + document rows
 * (Story 96). The slug is validated inside dba before any lookup; category
 * resolution only ever walks `chad_shared/knowledge`'s own children, so an
 * arbitrary/forged slug can never reach another repo or address.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  const { category } = await params;

  try {
    const view = await getKnowledgeCategory(category);
    return NextResponse.json({ category: view });
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
