-- Stores table
CREATE TABLE stores (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  logo TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Scraped Products table
CREATE TABLE scraped_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id INTEGER REFERENCES stores(id) NOT NULL,
  external_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  image TEXT,
  price_cash NUMERIC(12,2) NOT NULL,
  price_list NUMERIC(12,2),
  stock BOOLEAN DEFAULT TRUE,
  last_scraped_at TIMESTAMP DEFAULT NOW()
);

-- Price History table
CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_product_id UUID REFERENCES scraped_products(id) NOT NULL,
  price_cash NUMERIC(12,2) NOT NULL,
  price_list NUMERIC(12,2),
  scraped_at TIMESTAMP DEFAULT NOW()
);

-- Insert initial stores
INSERT INTO stores (name, url, logo) VALUES
  ('Compra Gamer', 'https://compragamer.com', NULL),
  ('Venex', 'https://www.venex.com.ar', NULL),
  ('FullH4rd', 'https://www.fullh4rd.com.ar', NULL),
  ('Gezatek', 'https://www.gezatek.com.ar', NULL),
  ('Maximus', 'https://www.maximus.com.ar', NULL);

-- Create index for faster searches
CREATE INDEX idx_scraped_products_name ON scraped_products USING gin(to_tsvector('spanish', name));
CREATE INDEX idx_scraped_products_store ON scraped_products(store_id);
