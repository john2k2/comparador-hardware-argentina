begin read only;
set local statement_timeout='3s';
set local time zone 'UTC';
select jsonb_build_object(
 'captured_at',clock_timestamp(),'database_name',current_database(),'timezone',current_setting('TimeZone'),
 'database_bytes',pg_database_size(current_database()),
 'cache_total_bytes',pg_total_relation_size('public.api_cache_entries'),
 'history_total_bytes',pg_total_relation_size('public.price_history'),
 'history_heap_bytes',pg_relation_size('public.price_history'),
 'history_index_bytes',pg_indexes_size('public.price_history'),
 'history_columns',(select jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull))
   from pg_attribute a where a.attrelid='public.price_history'::regclass and a.attname in('id','recorded_at','product_id','store_id','offer_url')),
 'cleanup_signature',(select pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cleanup_price_history' limit 1),
 'default_transaction_read_only',current_setting('default_transaction_read_only')
) as metadata;
rollback;
