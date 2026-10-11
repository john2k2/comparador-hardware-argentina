# Búsqueda con caché y actualización incremental: validación local

Fecha: 11/10/2026. Estado: funciona en workerd/D1 local en la Mac. No se creó
infraestructura remota, no se contrató un plan y no cambió la página publicada.
Este resultado permite continuar la preparación; no acredita todavía el costo
ni la velocidad del runtime remoto gratuito.

## Qué quedó implementado

La búsqueda conserva el contrato PostgreSQL de identidad, orden, totales y
paginación. Una proyección precalculada en la Mac permite resolver estadísticas
y filtros de precio sin reconstruir todas las ofertas durante cada consulta.
El texto sigue usando FTS y los filtros por tienda conservan el lector original.
La proyección filtra identidades activas antes de procesar el texto y tiene un
índice parcial para rangos de precios actuales. Hay 42 bloques máximos de texto;
si no completa el recorrido, falla explícitamente en vez de truncar resultados.

`caches.default` guarda respuestas completas por consulta, filtros, página,
evidencia y generación. Cada HIT valida el marcador de D1: una consulta/una fila.
El TTL máximo es 60 segundos y termina antes de la siguiente transición de
frescura/relevancia. No cambia la fecha de una oferta. Un cambio de generación
durante un MISS descarta la respuesta; un error de base no sirve un HIT viejo.
Solicitudes concurrentes iguales comparten el cálculo en el mismo proceso.
El navegador recibe `no-store`; la caché interna controla la vigencia.

La Mac compara capturas completas certificadas y recalcula únicamente cambios,
pares de identidad y vencimientos. Precio, proyección, generación y checkpoint
se confirman juntos en la copia SQLite offline. Repetir un checkpoint confirmado
verifica el destino y escribe cero filas. Un fallo revierte el delta completo.
Ver precondiciones de identidad y ejecución en [INCREMENTAL_LOCAL.md](INCREMENTAL_LOCAL.md).

El mantenimiento del reloj recalcula transiciones reales de las ofertas: tolerancia
futura de un minuto, relevancia de cuatro horas, vigencia de 24 horas y caducidad
del resumen. Si el runner se detiene, el Worker usa el lector original sin caché
y conserva las fechas reales; esa degradación aumenta lecturas. Esta ventana del
contrato de búsqueda no modifica las tres horas exigidas por las guías editoriales.

## Prueba con catálogo real

Primera captura pública: 05:06–05:10 UTC. Segunda captura: terminó a las
05:53:38.433 UTC. Ambas: 59.692 productos, 73.827 registros de precio,
57.548 resúmenes y 34 tiendas. La captura REST es secuencial, no una exportación
remota atómica. Se clonó exclusivamente el oráculo PostgreSQL privado sin TCP.
La certificación volvió a excluir una oferta que apuntaba a otra variante,
sin alterar originales ni producción. Persisten 2.144 productos sin resumen del
origen; estos conteos no prueban cobertura comprable completa.

Las 50 consultas de cada corte coinciden con el PostgreSQL correspondiente en
JSON, totales, filtros y paginación. Se probaron también errores, reloj, caché,
invalidación y rollback: **60/60 tests aprobados, sin omisiones**, incluidos
workerd/D1 local. El registro final de tests está en
`outputs/busqueda-gratis-cloudflare-2026-10-11/focused-tests.log`.

La segunda captura trajo cambios en 20 productos, 20 ofertas y 20 resúmenes,
sin altas/bajas ni cambios de tienda. **Los veinte precios siguieron iguales:**
cambiaron observaciones y algunos metadatos de identidad. No presentar este corte
como veinte rebajas. El delta medido, antes de agregar el contador diario, hizo
103 escrituras base; el modelo con índices estimó 265. La reproducción final
con ledger compartido hizo **104 escrituras base y 269 estimadas**. El delta anterior al ledger se reprodujo en D1 local
y se comprobaron los veinte registros completos y sus fechas contra la captura.
El reintento confirmado hizo cero escrituras. Cambios efectivos de precio,
stock, altas/bajas y errores se cubren con pruebas controladas adicionales.

Medición HTTP local posterior al delta, 05:59:55 UTC; caché vacía para cada clave,
runtime ya activo y memoria/disco calientes. Incluye evidencia de ofertas:

| Consulta actual | Lecturas MISS | Tiempo MISS | Lecturas HIT | Tiempo HIT |
|---|---:|---:|---:|---:|
| Precio $100.000–$500.000 | 22.256 | 40,5 ms | 1 | 4,6 ms |
| RTX, GPU, página 2 | 78.588 | 35,7 ms | 1 | 3,8 ms |
| Ryzen 5 5500 | 10.058 | 13,2 ms | 1 | 4,0 ms |
| Logitech | 37.800 | 24,9 ms | 1 | 4,0 ms |
| RTX 5070, CompraGamer | 32.127 | 27,2 ms | 1 | 3,7 ms |

Las cinco respuestas MISS/HIT son idénticas. El ensayo anterior sin proyección
leía 378.519 filas en el rango global. El nuevo corte y estado de caché del
sistema difieren: no usar esa comparación para prometer una latencia remota.
La base D1 local ocupa lógicamente **422.612.992 bytes** y `integrity_check=ok`.
La UI real mostró filtros, 13 resultados, paginación y caché HIT con una fila.

## Presupuesto gratuito y límites pendientes

D1 Free permite 5 millones de filas leídas y 100.000 escritas por día; el costo
de índices también importa. El límite de una base gratuita es 500 MB.
[Precios D1](https://developers.cloudflare.com/d1/platform/pricing/),
[límites D1](https://developers.cloudflare.com/d1/platform/limits/).
El catálogo proyectado cabe hoy, con margen limitado para crecimiento y staging.

La simulación de 24 horas con origen congelado y ticks de un minuto cambió 5.976
filas proyectadas en 262 ticks; 1.179 ticks no escribieron. Fueron 6.238
escrituras base y **38.738 estimadas con índices**. Eso excluye observaciones
nuevas y overhead de importación/contador. Al reservar cuatro operaciones por
tick con cambios, el modelo asciende a **39.786**. No equivale a facturación.

El contador `pilot_daily_write_budget` acumula estimaciones por día UTC, compartido
entre sincronización y mantenimiento, dentro de la misma transacción. El techo
es 80.000; excederlo revierte el cambio. Reserva overhead del propio ledger y del
marcador de importación. Un no-op no consume presupuesto. No permite aumentar el
techo registrado ni usar un reloj anterior para reiniciar el día. Este contador
local no conoce otras cargas de la cuenta ni mide facturación real de Cloudflare.

La carga inicial supera 425.000 escrituras base entre materialización y proyección,
antes de índices: no entra en un solo día gratuito. Debe distribuirse o reducirse
con staging y límites diarios verificables. El bootstrap de laboratorio permite
construir la copia local explícitamente; no acredita cuota ni publica al remoto.

Una consulta RTX fría aún lee unas 78.600 filas: unas 63 de esas consultas pueden
consumir los cinco millones diarios sin contar ningún otro tráfico. La caché es
por centro de datos, sin replicación global ni garantía de permanencia.
[Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/).
Todavía falta medir CPU remota: Workers Free admite 10 ms de CPU por invocación;
el tiempo HTTP local de esta tabla no mide ese límite.
[Límites Workers](https://developers.cloudflare.com/workers/platform/limits/).

Antes de sustituir la búsqueda pública: validar CPU/contadores en un entorno
remoto aislado y gratuito; medir diferencias durante ciclos reales de ofertas;
completar bootstrap, publicación por generación y recuperación tras interrupción;
integrar mapper/guardas de la API Next y comprobar recorridos públicos. La Mac
sigue siendo necesaria para preparar deltas y vencimientos mientras no exista
un runner probado. Esta etapa no instala un scheduler automático.

## Continuar localmente

La prueba existente se abre en `http://127.0.0.1:8797/`. Si el servidor se detuvo:

```sh
node_modules/.bin/wrangler dev --local \
  --config scripts/pilots/cloudflare-catalog/wrangler.local.jsonc \
  --persist-to outputs/catalogo-local-cloudflare-2026-10-11/d1-local --port 8797
```

Para recalcular un vencimiento en **SQLite offline**, exportando SQL local:

```sh
node scripts/pilots/cloudflare-catalog/projection-cli.mjs \
  OFFLINE_SQLITE NEW_CLOCK_DELTA.sql --now ISO_ACTUAL
```

El SQL deja el marcador listo al final. Un import interrumpido falla cerrado;
no debe usarse como publicación remota sobre la generación activa. El ledger debe
conservarse entre ejecuciones y compartirse con el delta de datos. El bootstrap
inicial requiere explícitamente `--bootstrap-lab --max-base-writes 80000` y una
copia no proyectada: es una construcción local fuera de la garantía de cuota.
No usar `--remote`, deploy/create/upload ni las credenciales de producción.

Evidencia completa en `outputs/busqueda-gratis-cloudflare-2026-10-11/`:
`parity-second-snapshot.json`, `worker-cache-runtime-final.json`,
`real-incremental-report.json`, `real-incremental-repeat.json`,
`real-guarded-incremental.json`, `real-guarded-repeat.json`,
`d1-final-integrity.json`, `clock-maintenance-simulation.json` y la captura UI.
