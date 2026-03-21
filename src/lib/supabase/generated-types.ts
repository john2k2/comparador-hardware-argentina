export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_cache_entries: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          payload: Json
          scope: string
          updated_at: string
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at: string
          payload: Json
          scope: string
          updated_at?: string
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          payload?: Json
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          bucket_key: string
          count: number
          created_at: string
          updated_at: string
          window_end: string
        }
        Insert: {
          bucket_key: string
          count: number
          created_at?: string
          updated_at?: string
          window_end: string
        }
        Update: {
          bucket_key?: string
          count?: number
          created_at?: string
          updated_at?: string
          window_end?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          parent_category: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon: string
          id: string
          name: string
          parent_category?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          parent_category?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_category_fkey"
            columns: ["parent_category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          id: string
          original_price: number | null
          price: number
          product_id: string
          recorded_at: string
          stock: string
          store_id: string
        }
        Insert: {
          id?: string
          original_price?: number | null
          price: number
          product_id: string
          recorded_at?: string
          stock?: string
          store_id: string
        }
        Update: {
          id?: string
          original_price?: number | null
          price?: number
          product_id?: string
          recorded_at?: string
          stock?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_prices: {
        Row: {
          created_at: string
          id: string
          installment_amount: number | null
          installment_count: number | null
          last_updated: string
          original_price: number | null
          price: number
          product_id: string
          state_signature: string | null
          stock: string
          store_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          installment_amount?: number | null
          installment_count?: number | null
          last_updated?: string
          original_price?: number | null
          price: number
          product_id: string
          state_signature?: string | null
          stock?: string
          store_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          installment_amount?: number | null
          installment_count?: number | null
          last_updated?: string
          original_price?: number | null
          price?: number
          product_id?: string
          state_signature?: string | null
          stock?: string
          store_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_prices_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_title_normalizations: {
        Row: {
          normalized_title: string
          raw_title: string
          source: string
          updated_at: string
        }
        Insert: {
          normalized_title: string
          raw_title: string
          source?: string
          updated_at?: string
        }
        Update: {
          normalized_title?: string
          raw_title?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          average_price: number
          brand: string
          canonical_product_key: string | null
          category: string
          content_signature: string | null
          created_at: string
          description: string | null
          family_key: string | null
          highest_price: number
          id: string
          image: string | null
          last_normalized_at: string | null
          last_scraped_at: string
          last_seen_at: string
          lowest_price: number
          model: string
          name: string
          normalized_title: string | null
          refresh_priority: string
          specs: Json
          updated_at: string
          variant_key: string | null
        }
        Insert: {
          average_price?: number
          brand?: string
          canonical_product_key?: string | null
          category: string
          content_signature?: string | null
          created_at?: string
          description?: string | null
          family_key?: string | null
          highest_price?: number
          id: string
          image?: string | null
          last_normalized_at?: string | null
          last_scraped_at?: string
          last_seen_at?: string
          lowest_price?: number
          model: string
          name: string
          normalized_title?: string | null
          refresh_priority?: string
          specs?: Json
          updated_at?: string
          variant_key?: string | null
        }
        Update: {
          average_price?: number
          brand?: string
          canonical_product_key?: string | null
          category?: string
          content_signature?: string | null
          created_at?: string
          description?: string | null
          family_key?: string | null
          highest_price?: number
          id?: string
          image?: string | null
          last_normalized_at?: string | null
          last_scraped_at?: string
          last_seen_at?: string
          lowest_price?: number
          model?: string
          name?: string
          normalized_title?: string | null
          refresh_priority?: string
          specs?: Json
          updated_at?: string
          variant_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_fkey"
            columns: ["category"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          color: string
          created_at: string
          id: string
          is_active: boolean
          logo: string
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          color?: string
          created_at?: string
          id: string
          is_active?: boolean
          logo?: string
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_active?: boolean
          logo?: string
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_api_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: Json
      }
      cleanup_price_history: {
        Args: {
          retain_daily?: string
          retain_hourly?: string
          retain_recent?: string
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
