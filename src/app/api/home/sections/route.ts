import { NextResponse } from 'next/server';
import { getHomeSectionsData } from '@/lib/home/home-sections';

export async function GET() {
  try {
    return NextResponse.json(await getHomeSectionsData());
  } catch (error) {
    console.error('Home sections API error:', error);
    return NextResponse.json(
      { error: 'Error al obtener secciones de home' },
      { status: 500 },
    );
  }
}
