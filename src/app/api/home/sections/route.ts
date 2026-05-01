import { NextResponse } from 'next/server';
import { getHomeSectionsData } from '@/lib/home/home-sections';

export async function GET() {
  try {
    const data = await getHomeSectionsData();
    
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Home sections API error:', error);
    return NextResponse.json(
      { error: 'Error al obtener secciones de home' },
      { status: 500 },
    );
  }
}
