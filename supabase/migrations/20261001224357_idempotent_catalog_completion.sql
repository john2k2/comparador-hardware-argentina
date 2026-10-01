-- Una respuesta perdida después del commit debe poder confirmarse sin duplicar trabajo.
ALTER TABLE public.catalog_offer_refresh_state ADD COLUMN last_completion_token uuid;
CREATE OR REPLACE FUNCTION public.finish_catalog_refresh(p_offer_id uuid,p_token uuid,p_result text) RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 IF p_token IS NULL OR p_result IS NULL OR p_result NOT IN ('observed','no-observation','source-failed','persist-failed','unsupported') THEN RETURN false; END IF;
 UPDATE public.catalog_offer_refresh_state q SET last_attempt_at=now(),last_result=p_result,last_completion_token=p_token,
  failures=CASE WHEN p_result='observed' THEN 0 ELSE least(q.failures+1,100) END,
  next_attempt_at=CASE WHEN p_result='observed' THEN '-infinity'::timestamptz
    ELSE now()+make_interval(hours=>least(24,power(2,least(q.failures,5))::integer)) END,
  lease_token=NULL,leased_until=NULL
 WHERE q.offer_id=p_offer_id AND q.lease_token=p_token AND q.leased_until>now();
 IF FOUND THEN RETURN true; END IF;
 RETURN EXISTS(SELECT 1 FROM public.catalog_offer_refresh_state q WHERE q.offer_id=p_offer_id AND q.last_completion_token=p_token AND q.last_result=p_result);
END $$;
REVOKE ALL ON FUNCTION public.finish_catalog_refresh(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_catalog_refresh(uuid,uuid,text) TO service_role;
