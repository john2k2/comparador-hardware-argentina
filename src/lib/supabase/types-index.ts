import type { Database } from './generated-types'

export type {
  Database,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
  CompositeTypes,
  Json,
} from './generated-types'

export type ProductRow = Database['public']['Tables']['products']['Row']
export type ProductPriceRow = Database['public']['Tables']['product_prices']['Row']
export type PriceHistoryRow = Database['public']['Tables']['price_history']['Row']
export type CategoryRow = Database['public']['Tables']['categories']['Row']
export type StoreRow = Database['public']['Tables']['stores']['Row']
