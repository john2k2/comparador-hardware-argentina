# Revisión de seguridad — 25/09/2026

## Alcance y resultado

Se revisaron rutas públicas y administrativas, autenticación de sesión, límites de solicitudes, cabeceras de producción, permisos y RLS del proyecto Supabase vinculado, dependencias instaladas y archivos versionados. Se aplicaron correcciones de privilegios en la base de datos y de código. Esto es una auditoría puntual; no equivale a una prueba de penetración ni garantiza ausencia de vulnerabilidades.

| Área | Evidencia | Estado |
|---|---|---|
| RPC de mantenimiento | `check_api_rate_limit` y `cleanup_price_history` eran `SECURITY DEFINER` y ejecutables por `anon` y `authenticated`. Se revocó `EXECUTE` a esos roles y a `PUBLIC`; `service_role` conserva acceso. Consulta posterior confirmó los permisos. | Corregido en Supabase; migración `20260925153000` registrada |
| Función de Auth | `handle_new_user` era ejecutable por roles públicos aunque se usa como trigger. Se revocó y se concedió a `supabase_auth_admin`. `set_catalog_updated_at` fija ahora `search_path`. Consulta posterior confirmó ambas propiedades. | Corregido en Supabase; migración `20260925154500` registrada |
| Políticas de datos | RLS activo en `user_profiles`, `user_favorites`, `price_alerts`, `products`, `product_prices`, `requested_offer_refreshes` y `api_rate_limits`. Perfiles, favoritos y alertas filtran por `auth.uid() = user_id`; catálogo tiene lectura pública, acorde al comparador. | Comprobado en la base vinculada |
| IP para rate limiting | La cabecera `X-Forwarded-For` tenía prioridad; en Cloudflare puede conservar un valor enviado por el cliente. Ahora se prioriza `CF-Connecting-IP`. | Código corregido y probado; versión `19b544a0` publicada. Falta una prueba controlada de abuso en producción |
| Cookie de sesión | Un `x-forwarded-proto` inesperado podía quitar `Secure` aun en producción. En producción la cookie queda siempre `Secure`. | Código corregido y probado; versión `19b544a0` publicada |
| Dependencias | `npm audit` inicial: 14 alertas, incluida una crítica en una dependencia de desarrollo. Tras actualizar Next, Wrangler, Vitest y las transitivas compatibles: 0 alertas en el árbol instalado, tanto completo como `--omit=dev`. | Corregido en lockfile; reauditar periódicamente |
| Cabeceras y acceso anónimo | Muestra pública: HSTS, CSP con nonce, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y `Permissions-Policy`; `/api/admin/operational` respondió 401 sin autenticación. | Comprobación puntual, no prueba de todos los roles/rutas |
| Secretos versionados | Archivos `.env` reales no están versionados; la búsqueda acotada de credenciales y claves privadas en archivos rastreados no dio coincidencias. | Comprobación estática, no historial completo ni escaneo externo |

La [documentación de Supabase sobre funciones](https://supabase.com/docs/guides/database/functions) explica por qué se deben revocar los permisos de ejecución de funciones privilegiadas. La [referencia de cabeceras de Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/) distingue `CF-Connecting-IP` de `X-Forwarded-For`.

## Riesgos y comprobaciones pendientes

1. **Degradación del límite de solicitudes.** Si Redis y la RPC de Supabase fallan, `checkRateLimit` usa memoria del proceso. En Workers distribuidos ese fallback no garantiza un límite global. No se cambió a rechazo total sin medir el impacto sobre búsqueda y disponibilidad. Medir fallos de la RPC y decidir una política explícita para abuso y caídas.
2. **Avisos del asesor de Supabase.** Persisten `pg_trgm` instalado en `public` y protección de contraseñas filtradas deshabilitada. Mover la extensión exige revisar objetos dependientes; la protección de contraseñas requiere confirmar disponibilidad del plan. No se cambiaron por conjetura ni se contrató un plan.
3. **Historial de migraciones desalineado.** Hay versiones locales ausentes en remoto y viceversa. Se aplicaron y registraron únicamente las dos migraciones de esta revisión. No ejecutar `supabase db push` indiscriminado; reconciliar historial y esquema antes de futuras migraciones.
4. **Pruebas de acceso.** El 401 anónimo y las políticas SQL no sustituyen una matriz real de usuario A, usuario B, administrador y cron. Probar lectura/escritura cruzada de favoritos, alertas y perfil en un entorno de prueba, además de todas las rutas administrativas.
5. **Operación y abuso.** Revisar logs de Cloudflare y Supabase, controles de bots y límites para búsquedas costosas; los muestreos de este corte no miden exposición sostenida ni resistencia a carga.

No se leyeron ni consignaron valores de secretos. La comprobación de esquemas de producto y la respuesta de Search Console se siguen por separado en el informe de crecimiento; un estado válido de datos estructurados no demuestra seguridad.

## Validación tras publicar

El build Next, el empaquetado OpenNext, 705 pruebas unitarias, lint y `npm audit` aprobaron. La primera ejecución de OpenNext tras actualizar dependencias detectó que `esbuild` debía estar declarado directamente para resolverlo desde la raíz; se añadió como dependencia de desarrollo y se repitió el build con éxito. La versión de Cloudflare `19b544a0-6e5d-47e9-9026-4b4d5541ff86` respondió 200 en portada, CPU, GPU, categorías y sitemap; `/api/admin/operational` respondió 401 sin sesión. Una solicitud de prueba con un token deliberadamente inválido y `x-forwarded-proto: http` recibió `Set-Cookie` con `Secure`, `HttpOnly` y `SameSite=lax`; no se intentó acceder con ese token. Estas son pruebas de humo, no una evaluación de penetración ni de carga.
