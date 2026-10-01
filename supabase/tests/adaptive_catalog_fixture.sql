-- Fixture mínima para comprobar cola y permisos en una base PostgreSQL aislada.
create table public.products(id text primary key,category text,last_scraped_at timestamptz);
create table public.product_prices(id uuid primary key default gen_random_uuid(),product_id text references products,store_id text,url text,last_updated timestamptz,price numeric,original_price numeric,stock text,installment_count integer,installment_amount numeric,identity_review jsonb,state_signature text,updated_at timestamptz);
create table public.stores(id text primary key,is_active boolean);
create table public.user_favorites(product_id text);
create table public.price_alerts(product_id text,is_active boolean);
create table public.price_history(product_id text,store_id text,offer_url text,price numeric,original_price numeric,stock text,recorded_at timestamptz);
insert into stores values ('store-a',true),('store-b',true),('inactive',false);
insert into products(id,category) select 'cpu-'||n,'procesadores' from generate_series(1,24)n;
insert into products(id,category) select 'mouse-'||n,'perifericos' from generate_series(1,24)n;
insert into product_prices(product_id,store_id,url,last_updated,price)
select id,case when row_number() over(order by id)%2=0 then 'store-a' else 'store-b' end,
  'https://example.com/'||id,now()-interval '10 days',100 from products;
insert into product_prices(product_id,store_id,url,last_updated,price) values ('cpu-1','inactive','https://example.com/inactive',now()-interval '10 days',100);
grant select on products,product_prices,stores,user_favorites,price_alerts to service_role;
grant usage on schema public to service_role;

grant insert,update on products,product_prices,price_history to service_role;
grant select on price_history to service_role;
