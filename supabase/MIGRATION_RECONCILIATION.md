# Historial reconciliado y persistencia transaccional instalada

El historial local quedó alineado con `argen-prices-db` (`zyiyziubpcpgoqlkcrie`):
27 versiones locales y remotas coincidentes. Se instaló
`20260930120000_atomic_catalog_offers.sql` antes del despliegue del consumidor.
La aplicación web todavía requiere desplegar sus cambios de código.

La ampliación posterior de búsqueda y rendimiento se describe en
[`CATALOG_READ_MODEL.md`](CATALOG_READ_MODEL.md). Agrega cinco migraciones hasta
`20260930135000`; el corte de 27 versiones de este documento corresponde a la
reconciliación inicial, antes de esa ampliación.

## Cambios de historial

Se comparó el SQL registrado en `supabase_migrations.schema_migrations` con los
archivos locales, ignorando comentarios, formato y envolturas de transacción.
Se conservaron los identificadores remotos de las migraciones ya ejecutadas.

Renombres locales, sin cambiar su SQL:

- `20260304183000` → `20260304235643`: esquema de catálogo.
- `20260305011000` → `20260305015934`: caché de normalización de títulos.
- `20260305203000` → `20260305185523`: RLS del catálogo.
- `20260306174000` → `20260306201947`: retención de historial.
- `20260306182000` → `20260306203742`: caché compartida y rate limiting.
- `20260307103000` → `20260307002840`: firmas de escritura.
- `20260305192000` → `20260331185853`: perfiles, favoritos y alertas.
- `20260501120000` → `20260501172403`: índices de la home.
- `20260902120000` → `20260902035244`: índice histórico de precios.
- `20260902140000` → `20260902040126`: versión rápida corregida del índice.
- `20260929155724` → `20260929161015`: persistencia de ofertas prioritarias.

Se recuperaron del historial remoto dos archivos ausentes: el esquema inicial
`20260120034347` y la primera versión rápida `20260902040037`, corregida por la
migración inmediatamente posterior. No se volvieron a ejecutar en producción.
La prueba de la RPC del índice utiliza ahora el nombre reconciliado.

## Operaciones remotas realizadas

1. Se verificaron las dos funciones del sitemap, sus cuerpos, firmas, permisos,
   comentarios y el índice parcial válido. Ya coincidían con `20260912170000`.
   Se registró esa versión con:
   `supabase migration repair --linked --status applied 20260912170000`.
2. El ensayo `supabase db push --linked --include-all --dry-run` mostró solamente
   las tres migraciones realmente pendientes.
3. `supabase db push --linked --include-all --yes` aplicó:
   - `20260420120000_add_cache_rate_limit_rls_policies.sql`: nueve políticas para
     el rol de servicio en las tablas de caché y rate limiting.
   - `20260420120001_add_search_optimization_indexes.sql`: siete índices que no
     existían en la base remota.
   - `20260930120000_atomic_catalog_offers.sql`: RPC de precio e historial
     atómicos por lote, con revalidación de observaciones bajo bloqueo.

## Verificación

- Reproducción completa de las 27 migraciones, en orden, sobre PostgreSQL local
  vacío con roles y esquema Auth mínimos para la prueba: aprobada.
- `supabase/tests/atomic_catalog_offers.sql` sobre esa base local: aprobado;
  cubre rollback, reintentos, observaciones atrasadas, revisiones y permisos.
- `npm test -- src/lib/price-index/rpc-migration.test.ts`: dos pruebas aprobadas.
- Los siete índices remotos nuevos quedaron `indisvalid=true` e
  `indisready=true`; las nueve políticas están limitadas a `service_role`.
- `persist_catalog_offers(jsonb)` quedó como `SECURITY DEFINER`, con
  `search_path=pg_catalog, public`, ejecución concedida a `service_role` y
  revocada a `PUBLIC`, `anon` y `authenticated`.
- Llamada remota con lote vacío bajo `SET LOCAL ROLE service_role`, dentro de
  una transacción de solo lectura terminada con `ROLLBACK`: aprobada. Esto
  comprueba acceso y resolución de la función, no escrituras reales de ofertas.
- `supabase db push --linked --dry-run`: `Remote database is up to date`.
- `supabase migration list --linked`: 27 versiones alineadas.

## Comprobación futura

Ejecutar secuencialmente desde la raíz del proyecto:

```sh
supabase migration list --linked
supabase db push --linked --dry-run
```

Con CLI 2.109.1, las verificaciones remotas simultáneas produjeron fallos de
autenticación del rol temporal `cli_login_postgres` y bloqueo transitorio del
pooler. Las mismas comprobaciones terminaron correctamente al ejecutarse en
secuencia. Evitar paralelizar comandos remotos de esta CLI sobre el proyecto.
