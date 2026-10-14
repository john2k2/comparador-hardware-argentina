-- Proyección de lectura calculada en la Mac, sin renovar las observaciones.
CREATE TABLE IF NOT EXISTS search_projection(
 product_id TEXT PRIMARY KEY REFERENCES products(id), category TEXT NOT NULL,
 catalog_identity TEXT NOT NULL, canonical INTEGER NOT NULL,
 lowest REAL, highest REAL, average REAL, available INTEGER,
 comparable_available INTEGER, urls TEXT, observed_at TEXT,
 next_transition TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS projection_identity_idx ON search_projection(category,catalog_identity);
CREATE INDEX IF NOT EXISTS projection_active_identity_idx ON search_projection(category,catalog_identity) WHERE comparable_available>0;
CREATE INDEX IF NOT EXISTS projection_clock_idx ON search_projection(next_transition);
CREATE INDEX IF NOT EXISTS projection_current_price_idx ON search_projection(lowest,product_id)
 WHERE canonical=1 AND comparable_available>0;
