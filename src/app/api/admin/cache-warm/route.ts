import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { warmHomePageCache } from '@/lib/server/cache-warming';
import { ensureAccess } from '@/lib/admin/catalog-refresh/access';

export async function POST(request: NextRequest) {
  try {
    // Verify admin access
    const access = await ensureAccess(request);
    if (!access) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const result = await warmHomePageCache();
    
    if (!result.success) {
      return NextResponse.json(
        { error: 'Failed to warm cache', details: result },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Cache warmed successfully',
      durationMs: result.durationMs,
      sectionsWarmed: result.sectionsWarmed,
    });
  } catch (error) {
    console.error('[CacheWarm API] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
