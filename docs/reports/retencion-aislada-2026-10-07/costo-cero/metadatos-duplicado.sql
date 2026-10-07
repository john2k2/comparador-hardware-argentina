begin read only;
set local statement_timeout='3s';
select jsonb_build_object('captured_at',clock_timestamp(),'indexes',(
 select jsonb_agg(jsonb_build_object(
 'index',c.relname,'bytes',pg_relation_size(c.oid),'definition',pg_get_indexdef(c.oid),
 'method',am.amname,'key_count',i.indnkeyatts,'total_attributes',i.indnatts,
 'key_attributes',i.indkey::text,'opclasses',i.indclass::text,'collations',i.indcollation::text,
 'options',i.indoption::text,'storage_options',c.reloptions,'tablespace',c.reltablespace,
 'primary',i.indisprimary,'unique',i.indisunique,'valid',i.indisvalid,'ready',i.indisready,
 'predicate',pg_get_expr(i.indpred,i.indrelid),'expressions',pg_get_expr(i.indexprs,i.indrelid),
 'constraints',(select count(*) from pg_constraint k where k.conindid=c.oid),
 'objects_depending_on_index',(select count(*) from pg_depend d where d.refclassid='pg_class'::regclass and d.refobjid=c.oid)
 ) order by c.relname)
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_index i on i.indexrelid=c.oid join pg_am am on am.oid=c.relam
 where n.nspname='public' and c.relname in('products_updated_at_idx','products_updated_at_desc_idx')
)) as metadata;
rollback;
