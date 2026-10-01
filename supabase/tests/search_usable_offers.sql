-- Ejecutar en PostgreSQL de pruebas con las migraciones aplicadas.
begin;
do $$
declare approved jsonb := jsonb_build_object(
  'version',1,'status','consistent','reason','consistent-text',
  'confidence',0.9,'model','jev-audit','reviewedAt','2026-10-01T12:00:00Z',
  'subject',jsonb_build_object('name','nvidia rtx 5060','category','tarjetas-graficas','url','https://example.invalid/5060'));
begin
  assert public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',null,'NVIDIA RTX 5060','tarjetas-graficas');
  assert public.catalog_offer_is_comparable(100,'low-stock','https://example.invalid/5060',approved,'NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(0,'in-stock','x',null,'NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable('NaN','in-stock','x',null,'NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'unknown','x',null,'NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'out-of-stock','x',null,'NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved||'{"status":"needs-review"}','NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved||'{"confidence":0.7}','NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved||'{"confidence":"malformed"}','NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved||'{"reviewedAt":"invalid-date"}','NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/other',approved,'NVIDIA RTX 5060','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved,'NVIDIA RTX 5060 Ti','tarjetas-graficas');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved,'NVIDIA RTX 5060','procesadores');
  assert not public.catalog_offer_is_comparable(100,'in-stock','https://example.invalid/5060',approved||'{"sourceIdentity":null}','NVIDIA RTX 5060','tarjetas-graficas');
end $$;
rollback;
