// ============================================
// Supabase Client - Cliente de base de datos
// ============================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

const CONFIG_ERROR = 'Supabase no configurado';

export interface Database {
  public: {
    Tables: {
      products: {
        Row: {
          id: string;
          name: string;
          category: string;
          brand: string;
          model: string;
          description: string | null;
          image: string | null;
          normalized_title: string | null;
          canonical_product_key: string | null;
          family_key: string | null;
          variant_key: string | null;
          refresh_priority: string;
          last_scraped_at: string;
          last_normalized_at: string | null;
          specs: Record<string, string> | null;
          lowest_price: number;
          highest_price: number;
          average_price: number;
          last_seen_at: string;
          content_signature: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          brand?: string;
          model: string;
          description?: string | null;
          image?: string | null;
          normalized_title?: string | null;
          canonical_product_key?: string | null;
          family_key?: string | null;
          variant_key?: string | null;
          refresh_priority?: string;
          last_scraped_at?: string;
          last_normalized_at?: string | null;
          specs?: Record<string, string> | null;
          lowest_price?: number;
          highest_price?: number;
          average_price?: number;
          last_seen_at?: string;
          content_signature?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          brand?: string;
          model?: string;
          description?: string | null;
          image?: string | null;
          normalized_title?: string | null;
          canonical_product_key?: string | null;
          family_key?: string | null;
          variant_key?: string | null;
          refresh_priority?: string;
          last_scraped_at?: string;
          last_normalized_at?: string | null;
          specs?: Record<string, string> | null;
          lowest_price?: number;
          highest_price?: number;
          average_price?: number;
          last_seen_at?: string;
          content_signature?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_prices: {
        Row: {
          id: string;
          product_id: string;
          store_id: string;
          url: string;
          price: number;
          original_price: number | null;
          stock: string;
          installment_count: number | null;
          installment_amount: number | null;
          last_updated: string;
          state_signature: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          store_id: string;
          url: string;
          price: number;
          original_price?: number | null;
          stock?: string;
          installment_count?: number | null;
          installment_amount?: number | null;
          last_updated?: string;
          state_signature?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          store_id?: string;
          url?: string;
          price?: number;
          original_price?: number | null;
          stock?: string;
          installment_count?: number | null;
          installment_amount?: number | null;
          last_updated?: string;
          state_signature?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      stores: {
        Row: {
          id: string;
          name: string;
          logo: string;
          url: string;
          color: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          logo?: string;
          url: string;
          color?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          logo?: string;
          url?: string;
          color?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string;
          slug: string;
          parent_category: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          icon: string;
          slug: string;
          parent_category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string;
          slug?: string;
          parent_category?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}

export const productQueries = {
  getAll: async (limit = 50, offset = 0) => {
    if (!supabase) return { data: null, error: CONFIG_ERROR };

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_prices (*)
      `)
      .range(offset, offset + limit - 1)
      .order('updated_at', { ascending: false });

    return { data, error };
  },

  search: async (query: string, filters?: { category?: string; minPrice?: number; maxPrice?: number }) => {
    if (!supabase) return { data: null, error: CONFIG_ERROR };

    let queryBuilder = supabase
      .from('products')
      .select(`
        *,
        product_prices (*)
      `)
      .or(`name.ilike.%${query}%,brand.ilike.%${query}%,model.ilike.%${query}%`);

    if (filters?.category) {
      queryBuilder = queryBuilder.eq('category', filters.category);
    }
    if (filters?.minPrice !== undefined) {
      queryBuilder = queryBuilder.gte('lowest_price', filters.minPrice);
    }
    if (filters?.maxPrice !== undefined) {
      queryBuilder = queryBuilder.lte('lowest_price', filters.maxPrice);
    }

    const { data, error } = await queryBuilder.limit(50);
    return { data, error };
  },

  getById: async (id: string) => {
    if (!supabase) return { data: null, error: CONFIG_ERROR };

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_prices (*)
      `)
      .eq('id', id)
      .single();

    return { data, error };
  },

  getByCategory: async (category: string, limit = 50) => {
    if (!supabase) return { data: null, error: CONFIG_ERROR };

    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_prices (*)
      `)
      .eq('category', category)
      .limit(limit)
      .order('lowest_price', { ascending: true });

    return { data, error };
  },
};

export const categoryQueries = {
  getAll: async () => {
    if (!supabase) return { data: null, error: CONFIG_ERROR };

    const { data, error } = await supabase
      .from('categories')
      .select('id,name,icon,slug,parent_category')
      .order('name');

    return { data, error };
  },
};

export const storeQueries = {
  getAll: async () => {
    if (!supabase) return { data: null, error: CONFIG_ERROR };

    const { data, error } = await supabase
      .from('stores')
      .select('id,name,logo,url,color,is_active')
      .eq('is_active', true)
      .order('name');

    return { data, error };
  },
};
