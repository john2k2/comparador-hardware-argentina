# Actualización del catálogo del piloto local

Corte de código: 11/10/2026. El coordinador comprobó el puente privado de búsqueda remota hacia esta cola, dos observaciones reales de MaxTecno y, en una prueba posterior, una de Katech; sus deltas se verificaron en D1 y en el navegador. FullH4rd respondió 403 desde la Mac y sigue sin observación nueva. Después de esas pruebas manuales se activó un ciclo automático acotado en la Mac: cada quince minutos hasta el 12/10 a las 15:03:10 UTC, con rotación durable y presupuesto. Su primer corte verificó una oferta de Gaming City y diecisiete intentos fallidos; 162 de 1.366 ofertas están dentro del consumidor actual. Véase [ciclo automático: resultado y cobertura parcial](CICLO_AUTOMATICO_CATALOGO_MAC_2026-10-11.md). No cambia la página publicada ni utiliza clientes Supabase. Véanse [prueba remota inicial](BUSQUEDA_CLOUDFLARE_PRUEBA_REMOTA_2026-10-11.md) y [prueba Katech/FullH4rd](ACTUALIZACION_KATECH_FULLH4RD_PILOTO_2026-10-11.md) para la evidencia y sus límites.

Buscar sobre una copia guardada necesita dos tareas distintas: responder rápido con lo que se conoce y volver a observar sus publicaciones. La búsqueda no debe esperar un barrido de veinte tiendas. Una consulta repetida tampoco convierte un precio viejo en una observación nueva.

## Flujo y contrato del coordinador

1. El Worker lee el catálogo y su caché. `remote-mac-server.mjs` transporta al proceso privado de la Mac únicamente IDs de productos conocidos, con límite y validación. No envía consulta libre, usuarios, IP ni credenciales a la cola. El puente probado escucha sólo en loopback; no integra el sitio publicado ni añade una escritura D1 por búsqueda.
2. `enqueueKnownProducts` resuelve publicaciones guardadas por ID, coalesce la demanda y programa las ofertas según su fecha real. Se admiten veinte IDs de producto y cien ofertas por llamada. Informa truncamiento; el consumidor necesita conservar esa señal y repartir lotes, nunca afirmar cobertura completa.
3. `claimRefreshBatch` toma como máximo veinticinco ofertas, en una transacción `BEGIN IMMEDIATE`, con un token durable por oferta. Dos consumidores no reciben simultáneamente el mismo lease vigente. Un lease vencido se puede reclamar con un token nuevo; el token anterior no puede confirmar.
4. Un lector autorizado en la Mac consulta destinos conocidos. Debe aplicar lista de dominios públicos de tiendas, límites de HTTP, pausa entre solicitudes, identidad exacta, condición de pago y stock. La cola no ejecuta fetch ni hace esa revisión por cuenta propia.
5. El writer local guarda una observación corroborada, revisa su elegibilidad y recalcula los resúmenes/proyección con generación nueva. Debe comprobar presupuesto antes del trabajo y registrar estimaciones del delta. El sincronizador incremental y su ledger diario siguen siendo el contrato de escritura D1; la cola se conserva localmente, fuera de los deltas públicos.
6. `acknowledgeRefresh` confirma sólo después de comprobar en `product_prices.row_json` la fecha que el writer ya guardó. Un error, un 403/429, una identidad incorrecta o una respuesta sin observación deja el último precio/fecha intacto. El sincronizador puede publicar únicamente los cambios corroborados, conservando su guardia de generación.

El catálogo general conserva 24 horas; una llamada para una guía puede usar tres horas sin ampliar su elegibilidad. La cola predeterminada demanda la observación noventa minutos antes del vencimiento; eso es programación, no renovación. Una búsqueda no solicita ampliación del catálogo: inventarios y productos que faltan requieren otro proceso con evidencia propia.

```js
import {
  initializeRefreshDemand, enqueueKnownProducts,
  claimRefreshBatch, acknowledgeRefresh,
} from '../scripts/pilots/cloudflare-catalog/refresh-demand.mjs';

initializeRefreshDemand(db); // SQLite privado que contiene products/product_prices.
enqueueKnownProducts(db, { productIds: result.products.map(p => p.id).slice(0, 20), now });
const leases = claimRefreshBatch(db, { now, limit: 10, leaseMs: 300000 });
// Lector + verificación + writer local asignados por el coordinador.
// Ninguna función de la cola modifica product_prices, summaries o price_basis.
acknowledgeRefresh(db, {
  offerId: lease.offerId, leaseToken: lease.leaseToken, now: Date.now(),
  outcome: 'observed',
  receipt: {
    offerId: lease.offerId, url: lease.url, observedAt: saved.last_updated,
    source: 'public-page', // O structured-source, contrastada por el lector.
    persisted: true, identityVerified: true, priceVerified: true, stockVerified: true,
    comparableVerified: true, // Revisión externa de variante y condición de pago.
  },
});
```

`comparableVerified` es un recibo del revisor/writer, no una certificación producida por la cola. Aun con ese recibo, precio no positivo, stock desconocido, backorder o agotado producen `comparable:false`. El consumidor debe acreditar los indicadores del recibo; pasarlos como constantes sin revisión no es evidencia.

## Errores, caducidad y costos

La demanda repetida dentro de sesenta segundos produce cero escrituras de cola. Una demanda posterior puede actualizar su vigencia, pero conserva un lease o backoff activos. El primer error espera treinta segundos; los siguientes duplican hasta seis horas. `retryAfterMs` respetado puede ampliar la pausa hasta veinticuatro horas. Después de cuarenta y ocho horas sin demanda, el destino deja de ser reclamable. No se borra el precio ni se infiere agotamiento por ese motivo.

ACK permite estos fallos normalizados: `http-403`, `http-429`, `http-error`, `network-error`, `no-observation`, `identity-mismatch`, `persistence-error`. No almacena mensajes de SDK, respuestas completas ni tokens. El proceso debe reintentar SQLite ocupado de forma acotada; no convertir un lock de otro consumidor en un refresco duplicado.

La cola y los leases escriben en la Mac. No se trasladaron a Cloudflare. Si se agrega un transporte remoto de demanda, deberá medirse por separado, deduplicar, limitar volumen y revisar sus permisos antes de publicarlo. El presupuesto de actualizaciones no incluye mágicamente esa nueva escritura. El límite de lote tampoco es un presupuesto diario ni acredita cobertura de todas las tiendas.

Si la Mac se apaga, los leases se conservan en disco pero la observación se detiene. La búsqueda debe mostrar la vigencia real y conservar el fallback del piloto; no prolongar fechas para disimular esa dependencia. Un ACK fallido después de persistir puede provocar otra lectura al vencer el lease; se prefiere ese reintento a declarar éxito sin recibo.

## Evidencia y diferencias con el flujo vigente

En esta copia, `src/lib/search/search-route-handler.ts:52` registra intención agregada después de responder. Sus llamadas en caché/base se limitan a páginas vencidas o vacías (`:279`, `:351`). `src/lib/server/background-refresh.ts:8` conserva el refresh HTTP interno desactivado salvo habilitación explícita. El nuevo `scripts/pilots/cloudflare-catalog/worker.mjs` sólo lee D1/caché y no ejecuta esos handlers de Next.

`src/lib/catalog/priority-refresh.ts:25` utiliza Supabase y `:75` persiste por RPC; `scripts/catalog/refresh-entry.ts:3` importa ese runner y el adaptativo. Se revisaron en lectura y no se ejecutaron: no son un writer local seguro por defecto. `fetchKnownOffer` podría reutilizarse mediante un adaptador local después de revisar sus importaciones y contratos, sin llamar a la persistencia remota.

La copia de trabajo no contiene `docs/direccion/README.md`. Se leyó el del checkout principal para contexto: su corte 10/10/2026 conserva cobertura y recuperación pendientes. No se copió esa dirección ni se atribuyó al piloto una observación de producción.

Prueba de cola: `node --test scripts/pilots/cloudflare-catalog/refresh-demand.test.mjs`, 14/14 aprobadas. Casos: repetición sin alterar ofertas, fecha real y ventana de guía, lease entre conexiones SQLite, token vencido, backoff/Retry-After, ACK sin persistencia, stock no comparable, identidad/persistencia sin verificar, demanda caducada, cambio de destino, límites y reloj hacia atrás. La allowlist opcional `storeIds` filtra antes de encolar y reservar; omitirla conserva el contrato original, y `[]` selecciona cero. Una prioridad con ventana de 24 h nunca posterga la demanda pendiente de 3 h; una ventana más estricta adelanta incluso dentro de la coalescencia.

## Consumidor local concreto preparado

`scripts/pilots/cloudflare-catalog/refresh-local.ts` integra demanda, lease, lector de fichas públicas, prueba de atributos, writer y ACK. Tiene límite absoluto de **tres ofertas por ejecución**, en las once tiendas de `WOO_PUBLIC_STORE_IDS`, más `fullh4rd`, `mexx`, `xtpc`, `gamingcity` y `compugarden`. Exige además CPU/GPU/RAM y atributos suficientes antes de HTTP; esta muestra tiene 162 destinos admitidos. Katech usa su HTML conocido; FullH4rd usa el lector de detalle existente y exige una URL HTTPS conocida `/prod/ID/slug`, sin query ni fragmento. El soporte del lector no demuestra acceso exitoso a esa tienda: la prueba real de FullH4rd quedó bloqueada. Los redirects controlados del transporte pueden generar más de tres solicitudes HTTP: el resultado contiene métricas reales `sourceHttp`, separadas de ofertas intentadas. El proceso mantiene el límite de fuente existente, con pausa de dos segundos, timeout de veinticinco segundos, cuerpo limitado y redirects únicamente en dominios configurados.

`--store-id` repetible limita tiendas antes de encolar y reservar. `--product-id` repetible limita tanto demanda como reserva; los pendientes ajenos de la misma tienda no consumen el lote ni generan HTTP. Omitir los IDs conserva el consumo general de la cola dentro de las tiendas admitidas. La API de reserva admite `productIds: []` para reservar cero y rechaza listas inválidas antes de tocar la cola.

Para Katech, `priceCondition: special` sólo se acredita si la etiqueta visible «Precio especial EFECTIVO/TRANSFERENCIA» y el importe leído pertenecen al mismo bloque principal y coinciden. Una etiqueta ausente, oculta, de recomendación o con importes contradictorios no acredita esa condición. El piloto muestra la condición junto al precio; no se cambió la interfaz pública.

La identidad usa `proveOfferAttributes`, `hasExplicitIdentityConflict` e `isComparableStoreOffer` existentes. Sólo CPU/GPU/RAM con prueba exacta de atributos se persisten. No llama al proveedor Jev, Supabase, un endpoint admin ni scripts remotos. Una coincidencia de chip sin variante suficiente no se aprueba.

El writer comienza `BEGIN IMMEDIATE` **antes** de leer el lease, destino, oferta y generación; valida token, estado y vencimiento dentro de la transacción. Conserva el historial original `price_basis.kind='historical'` y registra antes/después en `pilot_offer_observations`, privada en la Mac. Actualiza `product_prices` y la base comparable `current`; stock desconocido/agotado observado se guarda como tal y se retira de `current`. Anula sólo el resumen comparable precalculado afectado y recalcula su `comparable_latest_observed_at` desde las observaciones comparables persistidas, para que búsqueda con filtro de tienda/rango y fallback sigan coincidiendo.

La proyección reconstruye afectados y pares, incluidos los vencimientos del reloj, y cambia su generación para invalidar caché. ACK se confirma dentro de esa misma transacción mediante `withinTransaction:true`; cualquier rechazo del presupuesto revierte también ACK, raw, base, proyección e historial. Las estimaciones reservan índice/ledger y no equivalen a facturación remota. El resultado conserva `remotePublishSafe:false`: estos statements/datos privados no son un publicador remoto.

CLI: exige que el archivo real se llame `sample.sqlite`, distingue `--dry-run` de `--execute`, y no descubre productos cuando no se proporcionan IDs. Ejecutar desde este worktree. Esbuild aplica los alias de `tsconfig.json`; el bundle debe guardarse dentro del worktree para resolver dependencias externas como Cheerio. `projection.mjs` se importa dinámicamente desde el directorio del proyecto para conservar el URL de su archivo SQL.

```bash
node_modules/.bin/esbuild scripts/pilots/cloudflare-catalog/refresh-local.ts --bundle --platform=node --format=esm --packages=external --outfile=outputs/cloudflare-remoto-gratis-2026-10-11/refresh-local.bundle.mjs
node outputs/cloudflare-remoto-gratis-2026-10-11/refresh-local.bundle.mjs --dry-run outputs/cloudflare-remoto-gratis-2026-10-11/sample.sqlite --product-id ID_CONOCIDO --fresh-hours 3
```

`--dry-run` abre SQLite en lectura, no crea tablas/leases ni hace HTTP. La lista de destinos conocidos no acredita que la fuente responderá ni que su identidad podrá probarse. El coordinador ejecuta después, sobre la misma copia privada, el comando idéntico con `--execute` para la prueba acotada autorizada. No ejecutar sobre una base de producción ni un catálogo ajeno cambiándole el nombre.

```bash
node_modules/.bin/esbuild scripts/pilots/cloudflare-catalog/refresh-local.test.ts --bundle --platform=node --format=esm --packages=external --outfile=outputs/cloudflare-remoto-gratis-2026-10-11/refresh-local.tests.mjs
node --test outputs/cloudflare-remoto-gratis-2026-10-11/refresh-local.tests.mjs
```

Consumidor: **20/20 pruebas aprobadas**, sin HTTP real; cola: **18/18**. Se acredita el recorrido ID de búsqueda → demanda → reader inyectado → persistencia → proyección → ACK; fecha anterior conservada en histórico, lectura actual consistente entre proyección/original/filtro de tienda y después de vencer el intervalo, variante incorrecta, stock desconocido, presupuesto agotado con rollback y lease sustituido/vencido sin ninguna escritura de catálogo/ledger. Las regresiones adicionales cubren Katech/FullH4rd, 403 sin renovar fechas y selección antes de reservar, incluida la CLI con producto fresco y pendiente ajeno. El coordinador comprobó además búsqueda real → cola automática local → consumidor manual → publicaciones reales → delta privado D1 → fechas visibles en el navegador. El puente está integrado sólo para esta muestra. La ejecución automática del consumidor quedó comprobada sólo en el ensayo acotado enlazado al inicio. Transporte desde visitantes del sitio, lectores de las familias faltantes y descubrimiento de productos siguen pendientes.

El consumidor local exige el runtime Node 26 utilizado en la Mac; no actualiza las dependencias del sitio. `sqlite-runtime.d.ts` declara únicamente la API SQLite usada, porque los tipos Node 20 del proyecto no contienen `node:sqlite`. `refresh-demand.d.mts` expone options, lease y receipt explícitos para el módulo MJS. `npm run typecheck` aprobado sin suprimir errores ni excluir el consumidor de `tsconfig.json`; las 23 pruebas de cola/consumidor se repitieron y aprobaron después de añadir esos contratos de tipos.
