/**
 * API Endpoint: Todo Msg Dashboard Data
 *
 * GET /api/todo-msg?type=todo|first-msg
 *
 * Returns leads based on the requested type:
 * - type=todo: Returns leads that have "//todo" marker in their messages
 * - type=first-msg: Returns leads where your-first-message is true (first message not sent yet)
 *
 * All business logic is encapsulated in chad-dba public functions.
 * This endpoint is just a thin wrapper that calls the appropriate function.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTodoMsgLeads, getFirstMsgLeads } from "dba";

/**
 * GET /api/todo-msg?type=todo|first-msg
 * Returns filtered leads based on the type parameter.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");

  if (!type || (type !== "todo" && type !== "first-msg")) {
    return NextResponse.json(
      { error: "Invalid type parameter. Use 'todo' or 'first-msg'" },
      { status: 400 }
    );
  }

  try {
    if (type === "todo") {
      const leads = await getTodoMsgLeads();
      return NextResponse.json(leads);
    } else {
      const leads = await getFirstMsgLeads();
      return NextResponse.json(leads);
    }
  } catch (error) {
    console.error(`Error fetching ${type} leads:`, error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      { status: 500 }
    );
  }
}