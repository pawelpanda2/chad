import { NextResponse } from 'next/server';
import { createLead } from 'dba';

/**
 * POST /api/forms/lead
 * 
 * Creates a new lead in the shared Content Provider repository.
 * 
 * Request body:
 * - leadName: The name of the lead (e.g., "26-06-07_pn_Ania").
 *   The second letter of the code encodes the first contact type:
 *   x = no contact, n = number, w = whatsapp, i = instagram, f = facebook, t = telegram
 * - meetingDay: Date string (YYYY-MM-DD)
 * - approachKind: Single letter code (p = daygame, n = nightgame, t = tinder, s = organized event, z = friends, w = her initiative)
 * - name: Lead's first name
 * - surname: Optional surname
 * - postfix: Optional postfix (e.g., "ruda", "z_browarow")
 * - contacts: Optional YAML content for contacts
 * 
 * Returns:
 * - success: boolean
 * - leadName: string
 * - error: string (if failed)
 * - duplicate: boolean (if lead already exists)
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    const {
      leadName,
      meetingDay,
      approachKind,
      name,
      contacts,
    } = payload;

    // Validation
    if (!leadName) {
      return NextResponse.json({
        success: false,
        error: 'Nazwa leida jest wymagana',
      }, { status: 400 });
    }

    if (!meetingDay) {
      return NextResponse.json({
        success: false,
        error: 'Data poznania jest wymagana',
      }, { status: 400 });
    }

    if (!approachKind || approachKind.length !== 1) {
      return NextResponse.json({
        success: false,
        error: 'Źródło poznania jest wymagane',
      }, { status: 400 });
    }

    if (!name || !name.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Imię jest wymagane',
      }, { status: 400 });
    }

    // Create the lead
    const result = await createLead(leadName, contacts);

    if (result.success) {
      return NextResponse.json({
        success: true,
        leadName: result.leadName,
        leadLoca: result.leadLoca,
      });
    } else {
      const status = result.duplicate ? 409 : 500;
      return NextResponse.json({
        success: false,
        error: result.error || 'Nie udało się utworzyć leada',
        duplicate: result.duplicate,
      }, { status });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Nieznany błąd';
    console.error('[/api/forms/lead] ERROR:', errorMsg);
    
    return NextResponse.json({
      success: false,
      error: errorMsg,
    }, { status: 500 });
  }
}