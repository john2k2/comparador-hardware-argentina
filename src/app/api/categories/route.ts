// ============================================
// Categories API - API de categorias
// ============================================

import { NextResponse } from 'next/server';
import { categories as staticCategories } from '@/lib/scrapers/static-data';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import type { CategoryConfig } from '@/lib/types';

type CategoryRow = {
  id: string;
  name: string;
  icon: string;
  slug: string;
  parent_category: string | null;
};

export async function GET() {
  try {
    const supabase = getServerSupabaseReadClient();
    const { data, error } = supabase
      ? await supabase
        .from('categories')
        .select('id,name,icon,slug,parent_category')
        .order('name')
      : { data: null, error: 'Supabase no configurado' as const };

    const rows = (data ?? []) as CategoryRow[];

    if (!error && rows.length > 0) {
      const categories: CategoryConfig[] = rows.map((item) => ({
        id: item.id as CategoryConfig['id'],
        name: item.name,
        icon: item.icon,
        slug: item.slug,
        parentCategory: (item.parent_category ?? undefined) as CategoryConfig['id'] | undefined,
      }));

      return NextResponse.json({ categories });
    }

    if (error) {
      console.warn('Categories API fallback to static data:', error);
    }

    return NextResponse.json({ categories: staticCategories });
  } catch (error) {
    console.error('Categories API error:', error);
    return NextResponse.json(
      { error: 'Error al obtener categorias' },
      { status: 500 },
    );
  }
}
