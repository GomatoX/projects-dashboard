import { NextResponse } from 'next/server';
import { getActiveProjectIds } from '@/lib/ai/active-streams';

// Lightweight endpoint: returns the number of projects currently streaming a
// chat. Used by `ActiveTitleUpdater` to keep the browser tab `<title>` in sync
// without re-fetching the full project list every 5s.
export async function GET() {
  const ids = Array.from(getActiveProjectIds());
  return NextResponse.json(
    { count: ids.length, projectIds: ids },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
