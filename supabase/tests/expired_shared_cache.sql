-- Base local aislada: verificar límites y conservación de filas antes de aplicar retención.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'catalog_auth_qa' OR inet_server_addr() <> '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Exigir base local catalog_auth_qa';
  END IF;
END $$;
INSERT INTO public.api_cache_entries(cache_key,scope,payload,expires_at,created_at,updated_at) VALUES
 ('qa-cache-expired','home-sections','{}',now()-interval '2 days',now()-interval '3 days',now()-interval '2 days'),
 ('qa-cache-current','home-sections','{}',now()+interval '1 day',now(),now()),
 ('qa-cache-telemetry','operational-store-event','{}',now()-interval '2 days',now()-interval '3 days',now()-interval '2 days'),
 ('qa-cache-demand','catalog-refresh-demand','{}',now()-interval '2 days',now()-interval '3 days',now()-interval '2 days'),
 ('qa-cache-renewed','product-detail','{}',now()-interval '2 days',now()-interval '3 days',now());
DO $$ DECLARE r jsonb; BEGIN
  r := public.sweep_expired_shared_cache(now()-interval '5 minutes', 1);
  IF r->>'removed' <> '1' OR EXISTS(SELECT 1 FROM api_cache_entries WHERE cache_key='qa-cache-expired') THEN
    RAISE EXCEPTION 'No retiró exclusivamente la fila vencida elegible';
  END IF;
  IF (SELECT count(*) FROM api_cache_entries WHERE cache_key LIKE 'qa-cache-%') <> 4 THEN
    RAISE EXCEPTION 'Retiró una fila protegida';
  END IF;
  r := public.sweep_expired_shared_cache(now()-interval '5 minutes', 1);
  IF r->>'removed' <> '0' THEN RAISE EXCEPTION 'Replay retiró filas protegidas'; END IF;
  BEGIN
    PERFORM public.sweep_expired_shared_cache(now(), 1);
    RAISE EXCEPTION 'Admitió corte sin margen';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.sweep_expired_shared_cache(now()-interval '5 minutes', 2001);
    RAISE EXCEPTION 'Admitió lote ilimitado';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  IF has_function_privilege('anon','public.sweep_expired_shared_cache(timestamptz,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.sweep_expired_shared_cache(timestamptz,integer)','EXECUTE') THEN
    RAISE EXCEPTION 'Retención accesible sin privilegios';
  END IF;
END $$;
ROLLBACK;
\echo 'PASS: retención acotada; conserva caché activa, telemetría, demanda y filas renovadas.'
