-- Solo observaciones inválidas creadas en las pruebas de esta reparación.
-- La evidencia retirada se conserva en FUENTES-PLANTILLAS-EXCLUIDAS-2026-10-01.json.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
UPDATE public.catalog_refresh_runs r
SET summary = r.summary || jsonb_build_object('excludedTemplateObservations', bad.n, 'validObserved', (r.summary->>'observed')::int-bad.n)
FROM (
 SELECT r.id,count(*)::int n FROM public.catalog_refresh_runs r
 JOIN public.product_prices pp ON pp.last_updated BETWEEN r.started_at AND r.finished_at
 WHERE pp.store_id='compugarden' AND pp.source_identity->>'title'='§ITEMTIT§'
   AND pp.last_updated>='2026-10-01T20:49:34Z' AND pp.price=1
 GROUP BY r.id
) bad WHERE r.id=bad.id;

DELETE FROM public.price_history h USING public.product_prices pp
WHERE h.product_id=pp.product_id AND h.store_id=pp.store_id AND h.offer_url=pp.url
 AND pp.store_id='compugarden' AND pp.source_identity->>'title'='§ITEMTIT§'
 AND pp.last_updated>='2026-10-01T20:49:34Z' AND pp.price=1
 AND h.recorded_at>='2026-10-01T20:49:34Z' AND h.price=1;

-- No hay observación anterior recuperable en el historial de estas cinco URLs.
-- Cero representa precio no informado; epoch representa fecha desconocida.
UPDATE public.product_prices pp SET price=0,stock='unknown',last_updated='1970-01-01T00:00:00Z',state_signature=NULL,
 identity_review=jsonb_build_object('version',1,'status','needs-review','reason','explicit-conflict','reviewedAt',now(),'model',null,'confidence',null,
   'subject',jsonb_build_object('name',public.catalog_identity_text(p.name),'category',p.category,'url',pp.url))
FROM public.products p WHERE pp.product_id=p.id
 AND pp.store_id='compugarden' AND pp.source_identity->>'title'='§ITEMTIT§'
 AND pp.last_updated>='2026-10-01T20:49:34Z' AND pp.price=1;
COMMIT;
