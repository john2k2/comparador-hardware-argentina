-- Etapa 2 de simplificación: pausar tiendas que no aportan observaciones.
--
-- Evidencia: corridas adaptativas 46022136741 y 46058058206 (27/11/2026, ya con el VPS restablecido).
--   Bloquean al runner (403/429) y sus ofertas quedan diferidas ocupando cupo de la corrida:
--     fullh4rd, venex, hardcore, scphardstore (518 ofertas diferidas entre ambas corridas).
--   Cero observaciones en más de 50 intentos cada una:
--     beings, portaltech, hftecnologia, compugarden, clickgaming, gezatek.
--   Casi cero observaciones: wiztech (2 de 51), 37bytes (3 de 62, 59 fallos de fuente).
--
-- Sólo cambia stores.is_active. catalog_refresh_policy ya filtra por is_active, así que la cola
-- adaptativa deja de reclamar estas ofertas y la tienda sale de /api/stores.
-- No se borran ofertas, historial, favoritos ni alertas; las fichas siguen mostrando la última
-- observación con su fecha real.
--
-- Cobertura: catalog_refresh_coverage también deja de contar estas ofertas. Comparar cobertura
-- antes y después de esta migración sólo con el mismo conjunto de tiendas.
--
-- Reactivar una tienda cuando su scraper vuelva a funcionar:
--   update public.stores set is_active = true where id = '<id>';
update public.stores
set is_active = false
where is_active
  and id in (
    'fullh4rd', 'venex', 'hardcore', 'scphardstore',
    'beings', 'portaltech', 'hftecnologia', 'compugarden', 'clickgaming', 'gezatek',
    'wiztech', '37bytes'
  );
