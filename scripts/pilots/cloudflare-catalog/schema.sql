-- Sólo catálogo público. Sin usuarios, historial, tokens ni credenciales.
PRAGMA foreign_keys = ON;
CREATE TABLE pilot_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE products(
 id TEXT PRIMARY KEY, category TEXT NOT NULL, catalog_identity TEXT NOT NULL,
 catalog_name TEXT NOT NULL, catalog_document TEXT NOT NULL, catalog_component INTEGER NOT NULL,
 grouped_identity INTEGER NOT NULL, last_scraped_at TEXT, updated_at TEXT, row_json TEXT NOT NULL
);
CREATE INDEX products_identity_idx ON products(category,catalog_identity,grouped_identity DESC,last_scraped_at DESC,updated_at DESC,id);
CREATE INDEX products_category_idx ON products(category,catalog_component);
-- Subcadena literal, sin convertir 6000mhz/16gb en una identidad diferente.
CREATE VIRTUAL TABLE product_substrings USING fts5(id UNINDEXED,document,tokenize='trigram');
CREATE TABLE summaries(
 product_id TEXT PRIMARY KEY REFERENCES products(id), lowest REAL, highest REAL, average REAL,
 available INTEGER, urls TEXT, portable_listing INTEGER NOT NULL, store_ids_json TEXT NOT NULL,
 comparable_stats_json TEXT, comparable_valid_until TEXT, comparable_latest_observed_at TEXT,
 row_json TEXT NOT NULL
);
CREATE TABLE price_basis(
 product_id TEXT NOT NULL REFERENCES products(id), kind TEXT NOT NULL CHECK(kind IN ('historical','current')),
 id TEXT NOT NULL, store_id TEXT NOT NULL, price REAL NOT NULL, stock TEXT, url TEXT,
 observed_at TEXT
);
CREATE INDEX summaries_current_idx ON summaries(comparable_latest_observed_at,product_id);
CREATE INDEX summaries_valid_idx ON summaries(comparable_valid_until,product_id) WHERE comparable_stats_json IS NOT NULL;
CREATE INDEX basis_lookup_idx ON price_basis(product_id,kind,store_id,observed_at,price);
CREATE INDEX basis_observed_idx ON price_basis(kind,observed_at,product_id);
CREATE TABLE product_prices(id TEXT PRIMARY KEY,product_id TEXT NOT NULL REFERENCES products(id),store_id TEXT NOT NULL,price REAL,url TEXT,row_json TEXT NOT NULL);
CREATE INDEX prices_product_idx ON product_prices(product_id,price,store_id,url);
CREATE TABLE stores(id TEXT PRIMARY KEY,row_json TEXT NOT NULL);
