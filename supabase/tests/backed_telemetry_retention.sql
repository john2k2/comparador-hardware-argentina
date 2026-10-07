-- Sólo en la base aislada del harness; la transacción revierte fixtures y objetos de prueba.
BEGIN;
CREATE TEMP TABLE telemetry_snapshot AS
SELECT * FROM public.select_backed_telemetry_candidates('2026-10-01', 250);
INSERT INTO public.api_cache_entries
SELECT 'test:' || g, 'operational-store-event', '{"large":900719925474099312345,"decimal":0.1234567890123456789}'::jsonb,
  '2026-09-30 00:00:00.123456+00', '2026-09-28 00:00:00.123456+00', '2026-09-28 00:00:00.123456+00'
FROM generate_series(1,250) g;
INSERT INTO public.api_cache_entries VALUES
  ('protected:active','operational-store-event','{}',now()+interval '2 days',now(),now()),
  ('protected:other','catalog-refresh-demand','{}','2026-09-30','2026-09-28','2026-09-28');
INSERT INTO telemetry_snapshot SELECT * FROM public.select_backed_telemetry_candidates('2026-10-01',250);
CREATE FUNCTION pg_temp.expect_failure(statement text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN RETURN; END;
  RAISE EXCEPTION 'La operación insegura no fue rechazada';
END $$;

DO $$
DECLARE snapshot jsonb; result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(t)) INTO snapshot FROM telemetry_snapshot t;
  IF jsonb_array_length(snapshot) <> 250 OR (snapshot->0->>'payload_text') NOT LIKE '%900719925474099312345%'
    OR (snapshot->0->>'expires_at') <> '2026-09-30T00:00:00.123456Z' THEN
    RAISE EXCEPTION 'Se pierde número, microsegundo o límite de selección';
  END IF;
  IF has_function_privilege('anon','public.retire_backed_telemetry(timestamptz,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.select_backed_telemetry_candidates(timestamptz,integer)','EXECUTE')
    OR has_function_privilege('anon','public.select_backed_telemetry_candidates(timestamptz,integer)','EXECUTE')
    OR has_function_privilege('authenticated','public.retire_backed_telemetry(timestamptz,jsonb)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.retire_backed_telemetry(timestamptz,jsonb)','EXECUTE')
    OR EXISTS(SELECT 1 FROM pg_proc WHERE proname IN('retire_backed_telemetry','select_backed_telemetry_candidates') AND prosecdef) THEN
    RAISE EXCEPTION 'Privilegios o SECURITY INVOKER incorrectos';
  END IF;
  result := public.retire_backed_telemetry('2026-10-01',snapshot);
  IF result->>'removed' <> '250' OR result->>'changed_or_missing' <> '0'
    OR (SELECT count(*) FROM jsonb_array_elements_text(result->'removed_keys')) <> 250
    OR EXISTS(SELECT cache_key FROM telemetry_snapshot EXCEPT SELECT jsonb_array_elements_text(result->'removed_keys'))
    OR (SELECT count(*) FROM public.api_cache_entries) <> 2 THEN
    RAISE EXCEPTION 'Retiro no corresponde exactamente al lote';
  END IF;
  result := public.retire_backed_telemetry('2026-10-01',snapshot);
  IF result->>'removed' <> '0' OR result->>'changed_or_missing' <> '250' THEN
    RAISE EXCEPTION 'Repetición vuelve a atribuir un retiro';
  END IF;
END $$;

INSERT INTO storage.objects VALUES ('catalog-history-archive','{"size":50331649}');
SELECT pg_temp.expect_failure('SELECT public.select_backed_telemetry_candidates(''2026-10-01'',250)');
DELETE FROM storage.objects;
INSERT INTO storage.objects VALUES ('catalog-history-archive','{}');
SELECT pg_temp.expect_failure('SELECT public.select_backed_telemetry_candidates(''2026-10-01'',250)');
DELETE FROM storage.objects;

INSERT INTO public.api_cache_entries SELECT cache_key,scope,payload_text::jsonb,
  expires_at::timestamptz,created_at::timestamptz,updated_at::timestamptz FROM telemetry_snapshot;
UPDATE public.api_cache_entries SET payload='{"changed":true}' WHERE cache_key='test:1';
UPDATE public.api_cache_entries SET created_at=created_at+interval '1 microsecond' WHERE cache_key='test:2';
UPDATE public.api_cache_entries SET updated_at=now() WHERE cache_key='test:3';
DELETE FROM public.api_cache_entries WHERE cache_key='test:4';
DO $$
DECLARE snapshot jsonb; result jsonb;
BEGIN
  SELECT jsonb_agg(to_jsonb(t)) INTO snapshot FROM telemetry_snapshot t;
  result := public.retire_backed_telemetry('2026-10-01',snapshot);
  IF result->>'removed' <> '246' OR result->>'changed_or_missing' <> '4'
    OR (SELECT count(*) FROM public.api_cache_entries WHERE cache_key LIKE 'test:%') <> 3 THEN
    RAISE EXCEPTION 'Sobrescribe cambios de payload, creación o actualización';
  END IF;
  PERFORM pg_temp.expect_failure('SELECT public.select_backed_telemetry_candidates(now(),1)');
  PERFORM pg_temp.expect_failure('SELECT public.select_backed_telemetry_candidates(''2026-10-01'',251)');
  PERFORM pg_temp.expect_failure('SELECT public.select_backed_telemetry_candidates(''2026-10-01'',0)');
  PERFORM pg_temp.expect_failure('SELECT public.retire_backed_telemetry(now(),''[]'')');
  PERFORM pg_temp.expect_failure('SELECT public.retire_backed_telemetry(''2026-10-01'',''[]'')');
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)', (snapshot || jsonb_build_array(snapshot->0))::text));
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)', jsonb_build_array(snapshot->0,snapshot->0)::text));
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)', jsonb_build_array((snapshot->0)||'{"scope":"catalog-refresh-demand"}'::jsonb)::text));
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)', jsonb_build_array((snapshot->0)||'{"payload_text":null}'::jsonb)::text));
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)', jsonb_build_array((snapshot->0)||'{"extra":"forbidden"}'::jsonb)::text));
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)', jsonb_build_array((snapshot->0)||'{"expires_at":"infinity"}'::jsonb)::text));
  PERFORM pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)',
    jsonb_build_array((snapshot->0)||'{"cache_key":"missing:invalid-json","payload_text":"{invalid"}'::jsonb)::text));
END $$;

CREATE TABLE public.telemetry_test_reference(key text REFERENCES public.api_cache_entries(cache_key) ON DELETE CASCADE);
SELECT pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)',
  (SELECT jsonb_agg(to_jsonb(t)) FROM telemetry_snapshot t)::text));
DROP TABLE public.telemetry_test_reference;
CREATE FUNCTION pg_temp.telemetry_test_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$;
CREATE TRIGGER telemetry_test_trigger BEFORE DELETE ON public.api_cache_entries
FOR EACH ROW EXECUTE FUNCTION pg_temp.telemetry_test_trigger();
SELECT pg_temp.expect_failure(format('SELECT public.retire_backed_telemetry(''2026-10-01'',%L)',
  (SELECT jsonb_agg(to_jsonb(t)) FROM telemetry_snapshot t)::text));
DROP TRIGGER telemetry_test_trigger ON public.api_cache_entries;

SET LOCAL ROLE service_role;
DO $$
DECLARE result jsonb;
BEGIN
  IF (SELECT count(*) FROM public.select_backed_telemetry_candidates('2026-10-01',250)) <> 2 THEN
    RAISE EXCEPTION 'El runner no lee con RLS activo';
  END IF;
  IF (SELECT count(*) FROM public.api_cache_entries WHERE cache_key LIKE 'protected:%') <> 2 THEN
    RAISE EXCEPTION 'Se alteraron sentinelas';
  END IF;
  SELECT public.retire_backed_telemetry('2026-10-01',jsonb_agg(to_jsonb(c))) INTO result
    FROM public.select_backed_telemetry_candidates('2026-10-01',250) c;
  IF result->>'removed' <> '2' OR (SELECT count(*) FROM public.api_cache_entries) <> 3 THEN
    RAISE EXCEPTION 'El runner no retira únicamente el snapshot actual con RLS activo';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
