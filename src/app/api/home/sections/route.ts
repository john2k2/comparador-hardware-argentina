import { NextResponse } from 'next/server';
import { getHomeSectionsData } from '@/lib/home/home-sections';
import { isCatalogSqlBackendEnabled } from '@/lib/catalog/catalog-backend';
import { logger } from '@/lib/logger';

export async function GET() {
  try {
    const data = await getHomeSectionsData();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': isCatalogSqlBackendEnabled() ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch {
    logger.warn('Selección de portada no disponible');
    return NextResponse.json(
      { error: 'Error al obtener secciones de home' },
      { status: isCatalogSqlBackendEnabled() ? 503 : 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
