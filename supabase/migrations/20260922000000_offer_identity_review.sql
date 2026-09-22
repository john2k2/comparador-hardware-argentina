-- Revisión semántica por oferta. No certifica precio, stock ni disponibilidad.
-- Aplicar antes de activar ENABLE_JEV_OFFER_REVIEW. No cambia RLS.
ALTER TABLE public.product_prices
  ADD COLUMN IF NOT EXISTS identity_review jsonb;

COMMENT ON COLUMN public.product_prices.identity_review IS
  'Revisión de identidad vinculada a nombre/categoría/URL; señal orientativa. NULL significa no evaluada. No modifica last_updated ni price_history.';
