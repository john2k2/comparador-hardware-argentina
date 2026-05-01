/**
 * Cache Warming Script
 * 
 * Run this after deployment to pre-populate cache with critical data:
 * npm run cache:warm
 * 
 * Or call the API endpoint:
 * POST /api/admin/cache-warm
 */

import { getHomeSectionsData } from '@/lib/home/home-sections';
import { readPopularProductsFromDatabase } from '@/lib/persistence/product-read';
import { preloadCache } from '@/lib/server/shared-cache';

export async function warmHomePageCache(): Promise<{
  success: boolean;
  durationMs: number;
  sectionsWarmed: number;
}> {
  const startTime = Date.now();
  
  try {
    // Pre-fetch all home sections data
    const sectionsData = await getHomeSectionsData();
    const popularProducts = await readPopularProductsFromDatabase(8);
    
    // Warm cache with all sections
    await preloadCache([
      {
        scope: 'home-sections',
        key: 'homepage-v1',
        value: sectionsData,
        ttlMs: 10 * 60 * 1000, // 10 minutes
      },
      {
        scope: 'popular-products',
        key: 'homepage',
        value: popularProducts,
        ttlMs: 10 * 60 * 1000,
      },
    ]);
    
    const durationMs = Date.now() - startTime;
    
    return {
      success: true,
      durationMs,
      sectionsWarmed: 2,
    };
  } catch (error) {
    console.error('[CacheWarm] Failed to warm cache:', error);
    return {
      success: false,
      durationMs: Date.now() - startTime,
      sectionsWarmed: 0,
    };
  }
}
