# Publicación de interfaz y catálogo · 06/10/2026 UTC

Corte de las 03:00 UTC, 00:00 del 06/10 en Santiago. Jonathan autorizó publicar el candidato y comprobarlo en el dominio principal. **La interfaz está publicada y sus cambios se comprobaron. La estabilidad pública conserva un impedimento intermitente; no se declara recuperación sostenida.**

## Publicación verificada

- `main` recibió `7be80883b1a2e49d929b7411ef319b01242e64bc` sin sobrescribir historia. Los 559 archivos de entrada de aplicación coincidían con la copia de producción probada.
- Workers Builds `10a012c3-32ce-4926-a036-91ef0c4364a1` terminó aprobado. La versión `0d4b4946-8f5b-4f4c-a788-aff5d02e2b81` quedó activa al 100 %, despliegue `1f1c01ce-5cf0-4ad4-adff-ff8c3c8f175b`, creado a las 02:25:01.289383 UTC.
- [CI 37403860520](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/37403860520) aprobó verificación, SQL y navegador crítico para ese commit. El ajuste SQL posterior que sigue tiene pruebas locales y públicas propias; esa CI anterior no se atribuye a archivos posteriores.
- Se conservan estilo retro y colores, cabecera compacta, tarjetas uniformes, fichas técnicas, filtros sin la categoría duplicada, indicaciones de precios anteriores, temas y menú accesible. El índice de precios y su CSV devuelven 404 y desaparecieron de la navegación.

## Comprobaciones en el dominio principal

Lecturas espaciadas y sin envío de formularios, clics hacia tiendas/afiliados, solicitudes de actualización o eventos de prueba a Google.

| Control | Resultado fechado | Alcance y límite |
|---|---|---|
| HTTP | 32/32 aprobados | Rutas, filtros, orden, SEO, archivos retirados y guardas del Worker; no todas las respuestas son frías. |
| Apariencia y accesibilidad | 32 vistas aprobadas | Ocho rutas × dos temas × escritorio/390 px; Axe y contraste adicional de gradientes, un título principal, contenido y desbordamiento. No es certificación WCAG ni cada ID del catálogo. |
| Menú | 4/4 aprobados después de corregir el control | Teclado, Escape/foco, movimiento reducido y persistencia de tema en escritorio/móvil. Cuatro fallos iniciales de locator/inicialización de la prueba se conservan en el informe original; no hubo un cambio de interfaz por esos fallos. |
| Búsqueda global después del ajuste SQL | 4/4 aprobadas a las 02:48 UTC | Rango original, página 2 y seis rangos nuevos; 12 tarjetas con IDs/orden iguales al API, cero omisiones/reintentos. Los seis API nuevos respondieron en 373–893 ms y reportaron `DB-STALE`, no `HIT`. |
| RPC anónima directa después del ajuste | 15/15 aprobadas a las 02:47:58 UTC | Sin caché de respuesta, máximo 2.093 ms; rango general de ambos límites en 219 ms. Total/paginación, categorías, tienda, texto, vacío y orden comprobados. |
| Equivalencia SQL local | 15 JSON completos y 271 productos esperados aprobados | Rol anónimo, preferencia canónica, ofertas mixtas/vencidas/futuras/stock desconocido e inmutabilidad. Base PostgreSQL 17 aislada, sin fixtures en producción. |
| TestSprite anterior a publicar | 30/30 sintéticas y TC031 real 1/1 | Replay estricto QA, separado de la comprobación pública actual. TC031 concluyó a las 02:07:49 UTC; no se presenta como ejecución posterior al ajuste SQL. El navegador remoto sobre el dominio principal recibió el desafío 403; no se debilitó la protección. |

Las capturas públicas posteriores de las 02:58 UTC mostraron portada y ficha del Corsair M75 con el diseño nuevo, HTTP 200 y sin errores JS. **No anulan los fallos intermitentes conservados más abajo.** El bloque «Últimas ofertas» estaba vacío porque no tenía ofertas verificadas dentro de su ventana: no se fabricaron precios ni se renovaron fechas para llenar la portada.

## Ajuste adicional de la búsqueda detectado al publicar

El primer recorrido público del rango `minPrice=100137&maxPrice=300000&sortBy=price-asc` falló a las 02:25 UTC. El documento transmitió HTTP 200, pero terminó en el límite de error y sin tarjetas tras unos 8.963 ms. Los registros de la base confirmaron cancelación SQL `57014` a las 02:25:39.468 UTC. Once de los doce recorridos iniciales aprobaron; se conserva el fallo y no se contabiliza como aprobado por respuestas calientes posteriores.

Se añadió un índice de resúmenes recientes/precio y se acotaron los candidatos por precio **sólo cuando el resumen sigue válido**. Los resúmenes vencidos se recalculan antes del rango final y la ficha canónica preferida se sigue resolviendo globalmente; no se reemplaza una ficha preferida vencida por una copia inferior reciente. Texto, tienda y referencias históricas conservan su rama anterior. La función mantiene `SECURITY INVOKER`, permisos y ocho segundos de límite.

| Fuente local | Registro aplicado en Supabase | Momento comprobado |
|---|---|---|
| `20261006023536_current_catalog_bounded_candidates.sql` | `20261006024602_current_catalog_bounded_candidates` | 02:46:03 UTC |
| `20261006024548_current_catalog_bounded_candidates_function.sql` | `20261006024735_current_catalog_bounded_candidates_function` | 02:47:35 UTC |

Los timestamps del registro del proveedor y los nombres locales se conservan por separado. No reaplicar estas migraciones por la diferencia de nombre. El índice quedó válido; función, permisos y configuración se leyeron después. No se escribió ningún precio, stock, identidad o fecha de observación.

En dos pares de planes del mismo rango, la lectura anterior recorrió 2.878 candidatos/45.975 buffers frente a 1.154/21.122 del ajuste. Los tiempos variaron: anterior 3.032,165 y 162,749 ms; nuevo 165,878 y 117,597 ms. Ambos devolvieron el mismo JSON completo y total 839 en ese corte. Se declara reducción de trabajo en ese rango, **no un porcentaje garantizado de velocidad ni un benchmark de todo el catálogo**. La propuesta inicial que sólo movía la resolución canónica no aportó mejora y no se aplicó.

El corte anterior y los errores originales se conservan en [la corrección previa](./search-price-fix-2026-10-06.md). `DB-STALE` significa que se consultó la base y que algunas referencias devueltas superan la ventana estricta de tres horas; no significa caché de respuesta ni disponibilidad de guía/armador. El catálogo conserva 24 horas y guías/armador tres horas.

## Impedimento de estabilidad que sigue abierto

La captura adicional a las **02:49:33 UTC** de `/product/katech-api-973502` devolvió **Cloudflare 1102, «Worker exceeded resource limits»**, ray `a4615a8328f14b4e`. La portada mostró también el límite genérico de error en una captura cercana. Se conservaron ambas imágenes y no se sustituyen retroactivamente por una toma sana.

La cuenta se comprobó en modo de lectura: **Workers Gratuito**, límite nominal de **10 ms de CPU por solicitud**. El tail limitado a nuestras peticiones registró lecturas sanas que consumieron 17 ms en portada, 32 ms en ficha y 22 ms en el API de producto; la tolerancia temporal no convierte esos valores en un presupuesto sostenible. Una invocación antigua de portada a las 23:16:29 GMT-3 mostró 326 ms de CPU y un error en la versión anterior `b3a2ab26-1875-4219-b9bf-c827e066f023`. Ese registro anterior demuestra que había fallos antes de esta publicación, pero **no identifica la causa exacta del 1102 nuevo**. La muestra registrada es parcial y no acredita que todos los eventos fueran de CPU y no de memoria.

Cloudflare documenta el límite de [CPU y memoria, el error 1102 y sus outcomes separados](https://developers.cloudflare.com/workers/platform/limits/). Sin el outcome de esa solicitud no se atribuye automáticamente a CPU; el riesgo de cómputo queda comprobado por las mediciones. Las lecturas de las 02:51 y capturas de las 02:58 UTC volvieron a 200, lo que confirma intermitencia, no una reparación.

La siguiente prioridad es obtener la clasificación exacta de las solicitudes fallidas y reducir el renderizado y transformación por petición, evaluando entrega prerenderizada/cache pública y lecturas de catálogo acotadas para conservar el requisito de coste cero. Eso exige verificar frescura, CSP, RLS pública, SEO y navegación; no se implementó una migración arquitectónica improvisada durante el release. No se compró otro plan ni se modificaron límites, seguridad o credenciales.

La reversión del Worker sigue preparada en [REVERSION.md](./release-candidate-2026-10-05/REVERSION.md). No se ejecutó: la versión anterior ya tenía un fallo registrado y no se demostró que revertir el diseño resolviera este incidente. Cualquier recuperación posterior debe comprobar el runtime, no sólo una compilación aprobada.

## Evidencia y reproducción

`outputs/production-release-2026-10-06/summary-sanitized.json` registra este corte sin datos de cuenta, credenciales, IP, enlaces firmados o mensajes privados. Los reportes originales locales conservan `http/public-site.json`, `public-browser.json`, `public-appearance.json`, `public-menu-final.json`, `public-price-final.json`, `direct-rpc-final/direct-rpc-matrix.json`, `sql-plan-sanitized.json` y las capturas. `tail.private.json` no se publica.

```sh
PUBLIC_QA_ORIGIN=https://www.comparador-hardware.com.ar \
  npx playwright test --config=playwright.public.config.ts \
  e2e-public/global-price-search.spec.ts e2e-public/release-appearance.spec.ts
```

Estas pruebas son de lectura. No ejecutar la suite sintética interactiva contra producción. Los controles de cobertura G02, identidad de todo el catálogo, recepción GA4, consultas recibidas, AdSense y ventas Eneba conservan su estado independiente.
