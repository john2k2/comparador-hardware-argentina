-- ÚNICAMENTE para cluster sintético propio. No cargar en Supabase.
CREATE ROLE service_role;
CREATE ROLE anon;
CREATE TABLE public.products(id text PRIMARY KEY, marker text NOT NULL);
CREATE TABLE public.stores(id text PRIMARY KEY);
CREATE TABLE public.product_prices(id integer PRIMARY KEY, marker text NOT NULL);
CREATE TABLE public.user_profiles(id integer PRIMARY KEY, marker text NOT NULL);
INSERT INTO public.products VALUES ('p', 'preservar'), ('other', 'preservar');
INSERT INTO public.stores VALUES ('s'), ('other');
INSERT INTO public.product_prices VALUES (1, 'oferta-sintetica-preservar');
INSERT INTO public.user_profiles VALUES (1, 'usuario-sintetico-preservar');
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY, product_id text NOT NULL REFERENCES public.products(id),
  store_id text NOT NULL REFERENCES public.stores(id), offer_url text,
  price numeric(14,2) NOT NULL CHECK(price >= 0), original_price numeric(14,2),
  stock text NOT NULL DEFAULT 'unknown', recorded_at timestamptz NOT NULL
);
CREATE INDEX price_history_offer_idx ON public.price_history(product_id, store_id, offer_url, recorded_at DESC);
CREATE INDEX price_history_product_store_idx ON public.price_history(product_id, store_id, recorded_at DESC);
CREATE INDEX price_history_recorded_at_idx ON public.price_history(recorded_at DESC);
GRANT SELECT, UPDATE, DELETE ON public.price_history TO service_role, anon;

-- IDs deterministas y precios/stock sintéticos para detectar cualquier modificación ajena al DELETE.
INSERT INTO public.price_history(id, product_id, store_id, offer_url, price, stock, recorded_at)
SELECT ('00000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid,
  product_id, store_id, offer_url, 100 + n, 'unknown', recorded_at::timestamptz
FROM (VALUES
  (1, 'p', 's', 'expired', '2025-10-07T15:44:59.999999Z'),
  (2, 'p', 's', 'boundary365', '2025-10-07T15:45:00Z'),
  (3, 'p', 's', 'boundary365', '2025-10-07T16:00:00Z'),
  (4, 'p', 's', 'boundary365solo', '2025-10-07T15:45:00Z'),
  (5, 'p', 's', 'daily', '2026-06-01T01:00:00Z'),
  (6, 'p', 's', 'daily', '2026-06-01T23:59:59Z'),
  (7, 'p', 's', 'daily', '2026-06-02T00:00:00Z'),
  (8, 'p', 's', 'cross90', '2026-07-09T15:44:59Z'),
  (9, 'p', 's', 'cross90', '2026-07-09T15:45:00Z'),
  (10, 'p', 's', 'cross90', '2026-07-09T15:55:00Z'),
  (11, 'p', 's', 'hourly', '2026-08-01T01:00:00Z'),
  (12, 'p', 's', 'hourly', '2026-08-01T01:59:59Z'),
  (13, 'p', 's', 'hourly', '2026-08-01T02:00:00Z'),
  (14, 'p', 's', 'cross14', '2026-09-23T15:44:59Z'),
  (15, 'p', 's', 'cross14', '2026-09-23T15:45:00Z'),
  (16, 'p', 's', 'cross14', '2026-09-23T15:55:00Z'),
  (17, 'p', 's', 'raw', '2026-10-01T01:00:00Z'),
  (18, 'p', 's', 'raw', '2026-10-01T01:05:00Z'),
  (19, 'p', 's', 'future', '2026-10-08T00:00:00Z'),
  (20, 'p', 's', 'tie', '2026-08-01T10:10:00Z'),
  (21, 'p', 's', 'tie', '2026-08-01T10:10:00Z'),
  (22, 'p', 's', 'url-a', '2026-08-01T10:00:00Z'),
  (23, 'p', 's', 'url-b', '2026-08-01T10:30:00Z'),
  (24, 'other', 's', 'url-a', '2026-08-01T10:45:00Z'),
  (25, 'p', 'other', 'url-a', '2026-08-01T10:50:00Z'),
  (26, 'p', 's', NULL, '2026-08-01T12:00:00Z'),
  (27, 'p', 's', '', '2026-08-01T12:30:00Z'),
  (28, 'p', 's', 'leap-expired', '2024-02-29T23:59:59Z'),
  (29, 'p', 's', 'offset-a', '2026-08-01T01:00:00-03:00'),
  (30, 'p', 's', 'offset-a', '2026-08-01T04:59:59Z')
) AS fixture(n, product_id, store_id, offer_url, recorded_at);
