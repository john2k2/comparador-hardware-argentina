// ============================================
// Stores API - API de tiendas
// ============================================

import { NextResponse } from 'next/server';
import { stores as staticStores } from '@/lib/scrapers/static-data';
import { getServerSupabaseReadClient } from '@/lib/server/supabase-server';
import type { Store } from '@/lib/types';

type StoreRow = {
  id: string;
  name: string;
  logo: string;
  url: string;
  color: string;
  is_active: boolean;
};

export async function GET() {
  try {
    const supabase = getServerSupabaseReadClient();
    const { data, error } = supabase
      ? await supabase
        .from('stores')
        .select('id,name,logo,url,color,is_active')
        .eq('is_active', true)
        .order('name')
      : { data: null, error: 'Supabase no configurado' as const };

    const rows = (data ?? []) as StoreRow[];

    if (!error && rows.length > 0) {
      const stores: Store[] = rows.map((item) => ({
        id: item.id,
        name: item.name,
        logo: item.logo,
        url: item.url,
        color: item.color,
      }));

      return NextResponse.json({ stores });
    }

    if (error) {
      console.warn('Stores API fallback to static data:', error);
    }

    return NextResponse.json({ stores: staticStores });
  } catch (error) {
    console.error('Stores API error:', error);
    return NextResponse.json(
      { error: 'Error al obtener tiendas' },
      { status: 500 },
    );
  }
}
