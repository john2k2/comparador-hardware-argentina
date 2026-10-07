begin read only;
set local statement_timeout = '3s';
with target_indexes as (
 select t.relname as relation_name,c.relname as index_name,pg_relation_size(c.oid) as bytes,
 i.indisprimary as primary_key,i.indisunique as unique_index,i.indisvalid as valid,
 pg_get_indexdef(c.oid) as definition,
 coalesce(s.idx_scan,0) as recorded_scans,
 (select count(*) from pg_constraint k where k.conindid=c.oid) as constraint_count
 from pg_class t join pg_namespace n on n.oid=t.relnamespace
 join pg_index i on i.indrelid=t.oid join pg_class c on c.oid=i.indexrelid
 left join pg_stat_user_indexes s on s.indexrelid=c.oid
 where n.nspname='public' and t.relname in('products','price_history','catalog_price_summaries','product_prices')
), schema_totals as (
 select n.nspname,c.relisshared, sum(pg_total_relation_size(c.oid)) as bytes,count(*) as relations
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in('r','m') and n.nspname not like 'pg_toast%'
 group by n.nspname,c.relisshared
)
select jsonb_build_object('captured_at',clock_timestamp(),'database_bytes',pg_database_size(current_database()),
 'database_stats_reset',(select stats_reset from pg_stat_database where datname=current_database()),
 'indexes',(select jsonb_agg(to_jsonb(x) order by bytes desc) from target_indexes x),
 'schema_totals_with_shared_flag',(select jsonb_agg(to_jsonb(x) order by bytes desc) from schema_totals x)
) as metadata;
rollback;
