/**
 * API Endpoint: List CP history
 *
 * GET /api/content-provider/history - List changes to CP items
 *   ?addressPrefix=xxx - Restrict to items under this address (optional)
 *   ?operationType=insert|update|delete - Filter by operation (optional)
 *   ?dateFrom=2024-01-01T00:00:00Z - Filter by date range (optional)
 *   ?dateTo=2024-01-31T23:59:59Z
 *   ?page=1 - Pagination (default 1)
 *   ?pageSize=50 - Items per page (default 50, max 200)
 */

import { NextRequest, NextResponse } from 'next/server';
import { listCpHistory } from 'dba';
import { getCurrentUserFromCookies } from '@/lib/session';

/**
 * GET /api/content-provider/history
 *
 * Returns paginated list of changes to CP items (story lines, forms, etc.)
 * with filtering by address prefix, operation type, and date range.
 *
 * Every filter uses the caller's repoGuid from the session — no other repo's
 * data is ever leaked, regardless of addressPrefix values (see
 * documentation/dashboard/common/features/chad-user-data-isolation.md).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    return NextResponse.json(
      { success: false, error: 'NOT_AUTHENTICATED' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);

  // Parse optional query parameters
  const addressPrefix = searchParams.get('addressPrefix') ?? undefined;
  const operationType = searchParams.get('operationType') as 'insert' | 'update' | 'delete' | undefined;
  const dateFromStr = searchParams.get('dateFrom');
  const dateToStr = searchParams.get('dateTo');
  const page = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '50', 10);

  try {
    // Parse dates if provided
    const dateFrom = dateFromStr ? new Date(dateFromStr) : undefined;
    const dateTo = dateToStr ? new Date(dateToStr) : undefined;

    if (dateFrom && isNaN(dateFrom.getTime())) {
      return NextResponse.json(
        { error: 'Invalid dateFrom format' },
        { status: 400 }
      );
    }
    if (dateTo && isNaN(dateTo.getTime())) {
      return NextResponse.json(
        { error: 'Invalid dateTo format' },
        { status: 400 }
      );
    }

    // List CP history with filters
    const result = await listCpHistory({
      repoGuid: user.repoGuid,
      addressPrefix,
      operationType,
      dateFrom,
      dateTo,
      page,
      pageSize,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[dashboard] listCpHistory failed:', error);
    return NextResponse.json(
      { error: 'Failed to fetch history', success: false },
      { status: 500 }
    );
  }
}
