# Historial frío compatible: diseño preparatorio — 08/10/2026

**Propuesta: empaquetar historia fría por oferta en PostgreSQL, conservar `public.price_history` como tabla hot y leer ambas capas desde la RPC histórica.** Supabase Storage conserva el respaldo exacto recuperable. Este documento prepara el paso 2 del plan, después del drenaje respaldado de telemetría; no implementa cold ni autoriza retirar historia.

Revisión de contratos: `ebd1b69`, rama `codex/capacidad-costo-cero`, worktree `comparador-confianza/comparador-hardware-argentina`. HEAD al preparar este documento: `af3fa91`, con trabajo ajeno preservado. Alcance de escritura: sólo este archivo; sin migración, laboratorio, operaciones remotas, publicación ni cambio de coste/plan.

## Evidencia y volumen

| Corte / fuente local | Resultado y límite |
|---|---|
| 08/10/2026 19:46:54 UTC; `tmp/restructuracion-2026-10-08/retention-cohorts.json:1` | 38.436 filas de 0–14 d, 61.555 de 14–90 d y 150.615 de 90–365 d: **250.606**, no 250.406. Conteo agregado por franjas, distinto de la estimación estadística informada de 249.691. |
| 07/10/2026 20:11:28 UTC; `docs/reports/capacidad-2026-10-07/medicion.json:165` | Corte anterior: 248.876 filas; 193.751 sin URL. No trasladar ese denominador al corte del 08/10. |
| Piloto Storage del 07/10; `docs/reports/archivo-historial-2026-10-07/README.md:3` | 759 filas, ocho columnas, copia privada y restauración PG17 aislada. Originales conservados; no acredita respaldo global ni recuperación física. |

La muestra privada local de 5.000 filas no tiene representatividad demostrada. Sus proporciones no acreditan distribución global, cobertura de URLs vinculadas hoy ni ahorro del conjunto.

## Arquitectura propuesta

| Componente | Contrato propuesto |
|---|---|
| Hot | Mantener nombre, tabla física, PK, FK e inserts de `public.price_history`; conservar al menos los primeros 90 días sin alterar observaciones. No reemplazarla por una vista ni renombrarla. |
| Cold PG privado | Paquetes acotados por producto/tienda/URL exacta y período/parte. Identidad relacional fuera del JSONB; observaciones originales dentro. Topes de filas/bytes por paquete deben fijarse y medirse en laboratorio. |
| Fuente lógica SQL | Unir hot y cold sin duplicados; seleccionar paquetes por identidad de las ofertas elegibles antes de expandir JSONB. Mantener firma y algoritmo de `hardware_price_index`. No exponer la unión a roles públicos. |
| Storage | Respaldo exacto previo al movimiento, manifiesto confiable, hashes, conteos y descarga/restauración verificados. El piloto actual está limitado a 1.000 filas; no convertirlo en barrido global ampliando su límite. |
| Movimiento futuro | Lotes con pertenencia única, corte fijo y equivalencia de ocho campos. La transferencia PG y retiro hot deben ser atómicos; la copia Storage externa debe estar verificada antes. Reintento ambiguo exige reconciliar, nunca asumir éxito. |

Empaquetar primero sin pérdida. La compactación semántica posterior es otra unidad: debe conservar resultados y respaldo exacto antes de reducir observaciones. No congelar la cohorte elegible al crear el paquete.

## Lectores y escritores que condicionan el diseño

| Camino | Evidencia / condición |
|---|---|
| Home “Bajaron de precio” | `src/lib/home/home-sections.ts:296`: cinco campos, últimas 24 h, orden descendente, máximo 5.000. `:246` admite fallback sin URL; `src/lib/home/price-drop-baseline.ts:15` normaliza URLs. Hot ≥90 d preserva esta lectura directa. |
| Índice histórico | `src/lib/price-index/server.ts:17`: RPC 7–365 d, default 90, caché 6 h. No se encontró caller adicional de este helper ni ruta/UI consumidora en la revisión; preservar la RPC existente igualmente. |
| Ficha / gráfico / alertas | `src/lib/types.ts:130` y `src/lib/price-utils.ts:445` definen historia sin lector DB encontrado; alertas/favoritos priorizan refresh, sin evaluador histórico encontrado. No inventar ventanas públicas ni entrega de alertas. |
| General | `src/lib/persistence/product-catalog.ts:401` → `persist_catalog_offers` → helper `_unlocked`; insert histórico en `20260930120000_atomic_catalog_offers.sql:70`. Mantener escritura hot y transacción precio/historia. |
| Prioridad / solicitado | `src/lib/catalog/priority-refresh.ts:63`, `on-demand/worker.ts:185` → wrappers verificados → wrappers de bloqueo → helpers `_unlocked`; `20261002151329_persist_verified_listing_observations.sql:14`, `20260930133000_catalog_price_read_model.sql:190`. Mantener hot, locks, leases y evidencia. |
| Adaptativo | `src/lib/catalog/adaptive-refresh.ts:181` → `persist_adaptive_offer`; definición final encontrada `20261002143236_bind_observed_listing_identity.sql:5`, insert `:34`. Mantener hot y fecha observada. |
| Retención / reparaciones | `src/lib/persistence/price-history-maintenance.ts:44` llama cleanup; `20261001210122_quarantine_unresolved_observations.sql:15` retira observaciones inválidas específicas. Una futura reparación histórica deberá contemplar cold, sin aplicar automáticamente ese DELETE antiguo. |
| Archivo / restore / laboratorios | Exportadores y `scripts/pilots/catalog-restructure-*` deben distinguir tabla hot de historia lógica. Restore actual `scripts/pilots/history-archive-restore.mjs:33` usa `ON CONFLICT(id)` sólo sobre hot: no garantiza unicidad hot+cold. |

Persistencia general crea historia por cambios de precio/original/stock/cuotas; adaptativo, prioridad y solicitado por precio/original/stock. No unificar esa diferencia incidentalmente (`scripts/pilots/catalog-restructure-contracts.mjs:107`).

## Invariantes de integridad y serie

- Conservar ocho campos: `id`, `product_id`, `store_id`, `price`, `original_price`, `stock`, `recorded_at`, `offer_url`. Dinero `NUMERIC(14,2)` exacto, original nullable y firmado, timestamp con microsegundos; evitar conversiones JS con pérdida (`scripts/lib/history-archive.mjs:27`, `:43`, `:49`).
- Preservar UUID original y desempate. Exigir unicidad global entre hot y payloads cold, rechazo de colisión con valores distintos y restore repetible. Una PK del paquete o el `ON CONFLICT(id)` actual no bastan; el mecanismo es un gate del laboratorio.
- Mantener FK producto `ON UPDATE CASCADE / ON DELETE CASCADE` y tienda `ON UPDATE CASCADE / ON DELETE RESTRICT` (`20260304235643_initial_argen_prices_schema.sql:70`). No añadir FK a oferta actual: la historia no depende hoy de `product_prices.id`.
- Separar `offer_url IS NULL`, `offer_url = ''` y cada URL exacta en la identidad del paquete, con discriminador explícito de nulidad. No normalizar ni fusionar esos valores al archivar.
- La RPC selecciona ofertas **hoy** con stock in/low, precio positivo y categoría actual, y une por URL exacta (`20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql:27`). Cambios actuales de stock/precio/categoría/URL deben cambiar la cohorte reconstruida igual que antes.
- Última cotización por día de Buenos Aires, desempate `recorded_at DESC,id DESC`; preservar estados out/unknown/precio cero que interrumpen carry-forward. Mínimo diario por producto antes de mediana y conteo de ofertas separado (`20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql:55`, `:93`, `:96`).
- Conservar última cotización anterior al inicio local de 365 d como ancla por oferta, aunque sea más antigua. No limitar anclas a ofertas elegibles al archivar: pueden reactivarse. Consulta inclusiva de 365 d puede producir 366 fechas (`20260902040126_hardware_price_index_rpc_fast_plpgsql_fix.sql:23`, `:88`).
- Cleanup existente usa buckets de sesión y `coalesce(offer_url,'')`, con 14/90/365 (`20260824174500_catalog_integrity_and_offer_history.sql:62`). El corte previo fue UTC; no equivale a días Buenos Aires ni conserva NULL/vacío separados. No ejecutarlo antes para fabricar el material cold.

## Alternativas descartadas para esta primera unidad

| Alternativa | Motivo |
|---|---|
| Storage + lector/cálculo en Worker | La RPC SQL actual no consulta objetos. Exige nuevo cálculo o proyección SQL, selección de shards, transferencias y descompresión; traslada CPU/red al Worker y amplía recuperación y fallos. Storage continúa como respaldo. |
| Medianas diarias precomputadas por categoría | Congelan una cohorte que hoy es dinámica; no permiten recalcular mínimos por producto, cantidades y mediana tras cambios actuales. Una proyección por oferta sería otra opción, sujeta a paridad, no una mediana macro equivalente. |

## Aceptación del primer laboratorio local

1. Fixture independiente con NULL/vacío/URLs distintas, límites 90/365, ancla previa, empates UUID, microsegundos, máximo decimal/original negativo y cruce UTC/BA. RPC vigente como oracle.
2. Paridad de las cinco columnas completas para 7/90/365 días mediante diferencias en ambos sentidos; incluir interrupciones por stock/precio y carry-forward sin cotización reciente.
3. Repetir tras cambios actuales de stock, precio cero, categoría, URL y reactivación; detectar cualquier cohorte congelada.
4. Probar escritores y reintentos sin cambios contractuales; unicidad hot+cold, restore repetido, colisiones, FK/cascadas y fallos/interrupciones sin pérdida ni duplicación.
5. Medir heap/TOAST/índices, paquetes/filas seleccionados y expandidos, plan y tiempo SQL por 7/90/365. La generación final puede crecer como ofertas elegibles ×366; empaquetar no elimina ese trabajo.
6. Separar CPU/memoria local, ejecución SQL y red no ensayada. Medir pico de coexistencia, espacio de rollback y recuperación física; DELETE lógico o compresión del payload no prueban reducción de `pg_database_size`.

## Ruta gradual y rollback

Diseño → laboratorio serial → revisión independiente → inventario/respaldo completo y presupuesto físico → propuesta concreta de movimiento. Cada paso requiere evidencia propia; este documento sólo completa el diseño. Coste cero sigue vigente; cuotas Storage/egress y margen de DB deben comprobarse antes de ampliar.

Antes de retirar originales, rollback consiste en conservar hot y desactivar la lectura experimental. Después de un movimiento autorizado, restaurar y comprobar las ocho columnas, unicidad y RPC sobre hot completo **antes** de volver al lector antiguo. Conservar paquetes, manifiestos y respaldos hasta cerrar recuperación; no borrar copias como rollback.

Siguiente acción del coordinador: asignar archivos y límites del laboratorio PG anterior, sin código de aplicación ni producción. No hay implementación cold, ahorro global, publicación ni retiro de historia comprobados en esta entrega.
