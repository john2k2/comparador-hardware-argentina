# G02 — Actualización prioritaria de precios, 29/09/2026

## Problema y alcance

Una consulta general diaria no mantiene las ofertas de las tres guías dentro de su ventana de tres horas. A las 13:30 UTC las tres guías mostraban 0/7 ofertas recientes. El catálogo disponible seguía siendo mayoritariamente histórico. La fecha del producto no sustituye a la observación de cada oferta.

Se implementa un proceso dedicado para las publicaciones conocidas de las guías, reutilizando las reglas de variante, stock e identidad y hasta tres alternativas por pieza. Revisa cada hora las ofertas con al menos 90 minutos; una vez al día incluye la muestra fija G02 de nueve productos. No se afirma cobertura reciente del catálogo completo. GitHub puede retrasar los cron: se registra la hora real.

Los runners estándar de repositorios públicos no consumen el cupo de minutos privados: https://docs.github.com/en/billing/concepts/product-billing/github-actions . Repositorio público comprobado en GitHub el 29/09. No se contrata capacidad ni cambia el plan.

## Unidades y controles

1. **Integridad de observaciones:** CompraGamer conserva la hora de descarga al reutilizar su caché. Una revisión pendiente no desaparece al refrescar. Los fallos temporales del revisor pueden volver a comprobarse, pero siguen sin ofrecerse como comprables hasta pasar los controles. No se amplía la ventana de tres horas.
2. **Proceso prioritario:** endpoint administrativo exclusivo del runner, bloqueo persistente de 30 minutos, comprobaciones seriales espaciadas dos segundos, máximo 42 destinos de guías y 80 de muestra, corte de 18 minutos. Persistencia limitada a la terna existente producto/tienda/URL y observaciones posteriores al inicio del proceso. No consume ni modifica la cuota pública de solicitudes.
3. **Evidencia:** cada ejecución conserva respuesta por oferta y `catalog-freshness`. Un estado verde no significa que todas las piezas estén cubiertas. Los huecos, límites y observaciones rechazadas permanecen visibles.

## Validación previa a publicación

- 110 pruebas enfocadas aprobadas: planificación, acceso, persistencia rechazada, revisión pendiente, alternativas, guías y fechas de CompraGamer.
- TypeScript, lint y build de producción aprobados; YAML y scripts bash/Python del workflow validados.
- Migración `persist_priority_offer` aplicada: permisos `anon=false`, `authenticated=false`, `service_role=true`; URL/terna inexistente y observación anterior al proceso devuelven `false`.
- Advisors posteriores: sin advertencias de la nueva función. Permanecen avisos preexistentes de `pg_trgm` en public, protección de contraseñas filtradas y tablas internas con RLS sin política. No se cambian permisos ajenos a esta función.
- Falta registrar ejecución real y contraste de las guías tras publicar: no atribuirles éxito por estas pruebas.

## Reversión y cierre

La unidad de integridad puede revertirse separadamente; la unidad de programación puede retirarse revirtiendo el endpoint, planificador y cambios del workflow. La función SQL es aditiva, inaccesible a clientes y queda sin uso si se retira el proceso. Ninguna reversión requiere eliminar precios o historial.

G02 continúa **en observación**, no completado. Las ejecuciones manuales y las comprobaciones horarias de guías no cuentan como ciclos diarios útiles. Para cerrar se exigen siete ciclos diarios útiles medidos y frescura de la muestra fija; conservar numeradores/denominadores, calidad por tienda y evaluación de la meta de 95% en 24 horas. El 03/10 es un primer control posible, no una fecha prometida de cierre. Esta corrección no autoriza inventar disponibilidad, relajar identidad ni aprobar AdSense.

## Ajuste tras el primer contraste real, 16:16 UTC

El proceso ya guardó observaciones nuevas: la guía 1M devuelve 7/7 por ARS 994.303 y la 3M 7/7 por ARS 2.886.249; son cortes, no garantías futuras. La guía 2M tiene 6/7 y subtotal ARS 1.419.179, con GPU pendiente. Una RX 7600 conocida estaba excluida de nuevos intentos por una revisión `low-confidence` anterior. Se permite reunir evidencia nueva también ante `low-confidence` e `insufficient-evidence`; la oferta sigue fuera del precio comprable hasta superar la revisión. Los conflictos explícitos o del modelo no se habilitan. 52 pruebas de este ajuste y TypeScript/lint aprobados. La comprobación específica usa la cola pública existente y no cuenta como ciclo diario G02.

## Resultado del proceso prioritario y revisión de RAM

Run manual `36596115073`: 16:13:53–16:21:53 UTC, 87 destinos intentados, 65 observaciones guardadas, 59 con stock disponible/precio positivo y 22 comparables. Quince tiendas; 26 productos distintos globales. Sin truncamiento ni vencimiento del límite. Muestra: 42/60 ≤24 h y 42/60 ≤3 h; 37 de esas 42 pendientes de identidad, cinco candidatas comparables. Catálogo global: 215/47639 ≤24 h, 59/47639 ≤3 h. No se presenta esto como 95% ni cobertura del catálogo completo.

La revisión puntual `abd72e92-faad-4c7d-b7b8-d3d359372ee6`, runner `36596670538`, terminó el 29/09 a las 16:23:07 UTC con RX 7600 de CompraGamer comparable. Falta el contraste de la guía después de su caché.

La muestra reveló títulos agrupados de RAM con serie/RGB distintos a algunas URLs asociadas (Corsair RS frente a LPX; Kingston RGB frente a publicaciones sin ese atributo). Buscar el título completo impedía siquiera encontrar esas publicaciones. La búsqueda de RAM ahora usa marca, capacidad y generación para recuperar candidatos, pero exige la misma URL y conserva los controles de serie/variante; el test prueba que recuperar una LPX no aprueba su asociación con RS. Esto mejora el diagnóstico y no reagrupa variantes a ciegas. Trece pruebas enfocadas y TypeScript/lint aprobados para el ajuste. Los fallos de agrupación permanecen pendientes; no cambiar los nueve IDs de la muestra para mejorar artificialmente su porcentaje.

## Corte público final, 29/09/2026 16:27 UTC

Las tres rutas respondieron 200 y mostraron siete piezas con precios positivos, enlace de compra y fecha reciente. Evidencia de cada pieza en [G02-GUIAS-VERIFICADAS-2026-09-29.json](G02-GUIAS-VERIFICADAS-2026-09-29.json).

| Guía | Ofertas | Total ARS | Máximo ARS |
|---|---:|---:|---:|
| pc-gamer-1-millon | 7/7 | 994303 | 1000000 |
| pc-gamer-2-millones | 7/7 | 1954279 | 2000000 |
| pc-gamer-3-millones | 7/7 | 2886249 | 3000000 |

Envío, armado, licencia y periféricos aparte. No se presentan estos importes como precios congelados. La RX 7600 Challenger OC de la guía 2M declara 269,2 mm, alimentación de ocho pines y PSU recomendada de 550 W en [ASRock](https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%207600%20Challenger%208GB%20OC/); el Elite 302 declara 365 mm de espacio para GPU en [Cooler Master](https://www.coolermaster.com/es-global/products/elite-302.html). Esto respalda el espacio para esa GPU; no certifica BIOS/QVL ni sustituye comprobar la revisión y conectores entregados por la tienda.

### Observaciones por tienda del proceso principal

| Tienda | Filas observadas | Productos distintos | Con precio positivo y stock informado |
|---|---:|---:|---:|
| beings | 1 | 1 | 1 |
| compragamer | 17 | 17 | 17 |
| compugarden | 1 | 1 | 1 |
| dinobyte | 4 | 4 | 4 |
| gamerspoint | 1 | 1 | 1 |
| gamingcity | 3 | 3 | 3 |
| goldentechstore | 2 | 2 | 2 |
| katech | 6 | 6 | 6 |
| logg | 2 | 2 | 2 |
| maximus | 5 | 5 | 5 |
| maxtecno | 4 | 4 | 4 |
| mexx | 3 | 3 | 3 |
| scphardstore | 6 | 6 | 6 |
| shopgamer | 6 | 6 | 0 |
| xtpc | 4 | 4 | 4 |

Estas cantidades no acreditan identidad ni compra final. Artefacto original: [run 36596115073](https://github.com/john2k2/comparador-hardware-argentina/actions/runs/36596115073). La suma de productos por tienda no equivale a productos distintos globales.

### Dos publicaciones de RAM: control directo y corrección de disponibilidad

La solicitud `32f8d3c3-f933-4759-b9d2-962fca724d9a` / run `36597661670` terminó failed: los adaptadores no obtuvieron observaciones y no se modificaron fechas o precios por ese resultado. Lectura directa posterior: la publicación Maximus ITEM=8958 responde 200 con «Artículo sin stock»; GoldenTech Corsair LPX responde 404/Página no encontrada. Se corrigió únicamente stock de esas dos ternas existentes, respectivamente `out-of-stock` y `unknown`, con condición que evita pisar una observación más reciente. No se borraron ofertas, no se cambió precio ni `last_updated`, y no se convirtió un 404 en agotamiento probado.

Corte SQL de 16:31:04 UTC: misma muestra de nueve productos, **42/58 ≤24 h, 42/58 ≤3 h y 37 pendientes de identidad** entre las recientes. El denominador pasó de 60 a 58 por las dos correcciones comprobadas; conservar el 42/60 anterior como histórico. Los cinco candidatos restantes no equivalen a cinco fichas completas. Este ajuste manual no es un ciclo diario útil ni mejora por sí mismo la calidad de asociación.

### Publicación y seguimiento

Código publicado en `59e8e85`, `c52af9a`, `ab59cb5` y `1487230`. Workers Builds aprobó el último en `8415f840-7987-4386-8d85-2fe2b8ec799e` a las 16:29:36 UTC. Endpoint prioritario público sin autorización: 401. Workflow prioritario real success en ocho minutos; revisión puntual GPU success; prueba de las dos RAM failed por ausencia de observaciones, clasificada arriba sin ocultarla. No se inició ninguna solicitud AdSense ni se cambiaron credenciales.

G02 sigue en observación con la misma fecha y criterios; no se modifica el tablero a completado. Próximos controles: medir cron horario real, reparar asociaciones de variantes con evidencia y resolver publicaciones retiradas/sin stock sin renovar artificialmente sus precios, y completar siete ciclos diarios útiles. La automatización conserva el horario de seguimiento, la muestra y sus restricciones; las ejecuciones de esta sesión son manuales y quedan fuera del contador diario.
