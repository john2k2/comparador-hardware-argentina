# Lectura paginada del catálogo

SSR, `/api/search` y el listado de `/api/products` usan `search_catalog_page`.
El total, los filtros y el orden se calculan antes de paginar; el Worker recibe
como máximo 48 productos y no reagrupa el catálogo completo.

## Contrato

- Un registro persistido por categoría y nombre normalizado exacto. Se prefiere
  el ID `agrupado-*` con ofertas elegibles; hay fallback a registros individuales.
- No se fusionan nombres aproximados al consultar. La agrupación aproximada
  pertenece a ingestión; las claves RAM/GPU antiguas no unen variantes en lectura.
- Cada resultado conserva ofertas de su propio `product_id`, para que el enlace
  de detalle y las solicitudes de actualización referencien filas reales.
- La selección por tienda ocurre antes del filtro de importe; las reglas de
  disponibilidad, mejor oferta por tienda y outliers determinan el precio mostrado.
- Orden estable con desempate por ID. Las páginas fuera de rango se ajustan a la
  última; vacío real devuelve total 0 y página 1. Fallos de DB producen error,
  no un catálogo vacío aparentemente exitoso.
- Las guías y el armador mantienen sus validaciones específicas de frescura,
  identidad y stock. Sus lectores no se sustituyen por esta RPC paginada.

## Resumen transaccional

`catalog_price_summaries` contiene los precios comparables y las mejores ofertas
por tienda de cada ficha. Un trigger actualiza únicamente la ficha afectada por
un cambio en `product_prices`, dentro de la misma transacción.

Los RPC de escritura y limpieza bloquean primero la ficha y luego sus ofertas.
Sus implementaciones originales se conservan como helpers `_unlocked`, sin
permiso de ejecución para `PUBLIC`, `anon`, `authenticated` ni `service_role`;
sólo los wrappers privilegiados pueden invocarlas. La consulta pública es
`SECURITY INVOKER` y el resumen tiene RLS de sólo lectura para usuarios públicos.

La medición inicial de la consulta global reconstruía todos los precios y costó
aproximadamente 14 s. Se incorporaron el resumen, estadísticas del planificador
y planes personalizados sin JIT para esta RPC. En una medición posterior con
`EXPLAIN ANALYZE` la misma consulta global costó aproximadamente 1,27 s. Es un
corte de medición, no un SLO ni una garantía de latencia futura.

La comprobación posterior por la API pública detectó que el plan global todavía
podía superar el límite del rol `anon`. Las migraciones `20260930140000` a
`20260930142000` especializan el SQL mediante parámetros enlazados, limitan la
segunda ordenación a la página y añaden índices de cobertura. La consulta real
sin categoría (`minPrice=100000&sortBy=price-asc`) respondió HTTP 200 con total
22.802 y 12 productos; otras dos consultas globales nuevas también respondieron
HTTP 200. Los totales corresponden al catálogo observado en esa comprobación.

## Despliegue y verificación

Aplicar las migraciones hasta `20260930142000` antes de desplegar el consumidor.
Las migraciones intermedias conservan la evolución que ya se aplicó en Supabase;
no deben renumerarse ni volver a ejecutarse sobre una base con historial vigente.

```sh
npm run verify
npm run test:e2e:critical
supabase db push --linked --dry-run
```

`verify` incluye lint de E2E, TypeScript, tests de aplicación y contratos de los
scripts operativos. Los tests de componentes reales requieren Chrome instalado.
Los E2E críticos usan datos simulados, reloj explícito y servidor local aislado.

En una base PostgreSQL **local vacía**, preparar roles/Auth mínimos con
`tests/bootstrap-local.sql`, aplicar todas las migraciones en orden y ejecutar:

```sh
psql -v ON_ERROR_STOP=1 -f supabase/tests/atomic_catalog_offers.sql
psql -v ON_ERROR_STOP=1 -f supabase/tests/paginated_catalog.sql
node --test supabase/tests/catalog-concurrency.test.mjs
```

El test de concurrencia exige `PGHOST=127.0.0.1` o `localhost` y un `PGDATABASE`
que empiece por `catalog_` o `catalog-`. Comprueba bloqueo real de dos sesiones,
coherencia de precio/historial/resumen, reintentos y limpieza.

`.github/workflows/verify.yml` ejecuta estas verificaciones con PostgreSQL 17 y
Node 22. Los runners operativos compilan el checkout de GitHub: publicar sólo el
Worker no actualiza su código; las correcciones deben estar también en `main`.
