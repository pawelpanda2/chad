/**
 * API Endpoint: Beeper WhatsApp Conversation
 *
 * GET /api/beeper/conversation/[leadName] - Get WhatsApp conversation for a specific lead
 */

import { NextResponse } from "next/server";
import { getBeeperWhatsappConversation } from "dba";

interface RouteParams {
  params: Promise<{
    leadName: string;
  }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    const { leadName } = await params;
    if (!leadName) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing required route param: leadName",
        },
        {
          status: 400,
        }
      );
    }

    const decodedLeadName = decodeURIComponent(leadName);
    const content = await getBeeperWhatsappConversation(decodedLeadName);

    if (content === null) {
      return NextResponse.json(
        {
          ok: false,
          error: `No conversation found for lead: ${decodedLeadName}`,
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      ok: true,
      leadName: decodedLeadName,
      content,
    });
  } catch (error) {
    console.error("Error fetching beeper conversation:", error);
    return NextResponse.json(
      {
        ok: false,
        error: String(error),
      },
      {
        status: 500,
      }
    );
  }
}
