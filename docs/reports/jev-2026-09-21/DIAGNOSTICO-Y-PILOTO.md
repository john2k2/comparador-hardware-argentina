# Jev, calidad del catálogo y presupuestos

Evaluación del 21/09/2026. Este documento conserva el diagnóstico inicial y su propuesta. La etapa exploratoria posterior ya se ejecutó: ver `piloto-calidad/RESULTADOS.md` y sus datos. Sin integración ni despliegue de producto en esta tarea.

Jev puede aportar criterio semántico sobre alternativas y evidencia que el comparador ya haya obtenido. La precisión de precios, stock y compatibilidad depende primero de obtener y validar los datos. La recomendación es reutilizar el armador existente, corregir la calidad de las ofertas y probar Jev en casos ambiguos sin afectar inicialmente los resultados públicos.

## Evidencia actual

Pruebas públicas realizadas entre 22:19 y 22:22 UTC (19:19–19:22 en Santiago). Es una muestra puntual, no una auditoría de todo el catálogo.

| Superficie | Resultado observado | Alcance de la evidencia |
|---|---|---|
| Portada | HTTP 200, 1,20 s | Disponibilidad en esa petición |
| `/api/search?q=rtx%204060` | HTTP 200, 1,84 s, `DB-STALE`, 25 resultados totales y 12 en la página | La búsqueda funciona pero utiliza ofertas antiguas |
| `/api/products?category=procesadores&limit=5` | HTTP 200, 2,71 s, 301 productos devueltos | El parámetro `limit=5` no acotó esta respuesta; no se investigó su contrato |
| `/guia/armar?pesos=1500000` | HTTP 200, 1,20 s, 5 de 7 partes comprables | Existe armador funcional; esta configuración quedó incompleta |

El armador de $1.500.000 ARS mostró subtotal de $1.241.381 y faltantes de GPU y fuente. El procesador seleccionado se rotula “Sin Cooler” y la explicación indica que necesita uno; el esquema de siete componentes no agrega su costo. Es un ejemplo observado, no una recomendación de compra.

La primera solicitud exploratoria utilizó `?budget=1000000`, que no es el parámetro del armador: sólo mostró el formulario. El contrato correcto es `pesos`; la prueba del presupuesto completo se hizo con ese parámetro.

### Contradicción comprobada en una oferta

La búsqueda de RTX 4060 devolvió una ficha llamada `Placa De Video Gigabyte Rtx 4060 Eagle Oc Ice 8gb (white)` con una oferta de XT-PC de $684.710, fechada `2026-06-24T03:04:21.012Z`.

El destino de esa oferta es [esta página de XT-PC](https://www.xt-pc.com.ar/prod/30551/placa-de-video-geforce-rtx-5060-8gb-gigabyte-eagle-oc). Se abrió directamente y respondió 200: título y encabezado identifican una **RTX 5060**, código `VGA2910`, con precio especial de $866.390,04 para débito, transferencia o efectivo. Hay una asociación incorrecta entre el producto del comparador y el destino actual. No se determinó si nació de una agrupación, una actualización parcial o un cambio de la tienda.

Otras ofertas de la muestra tenían `lastUpdated` de abril. La fecha del producto y la fecha de cada oferta son diferentes: refrescar el producto no prueba que todas sus ofertas sean recientes.

El HTML de XT-PC contiene mensajes de stock web, ausencia de stock local y un mensaje de indisponibilidad. La extracción de texto no distingue qué elementos están visibles o activos. No se verificó checkout ni disponibilidad efectiva; ese stock queda por confirmar.

## Qué existe en el código

- Scrapers por tienda y plataforma; búsqueda con catálogo persistido y demanda pendiente. En producción el scraping público está desactivado por defecto (`src/lib/server/runtime-flags.ts:22`).
- El scheduler está configurado una vez al día a las 05:05 UTC y procesa `mode=demand&maxQueries=1` (`.github/workflows/catalog-refresh.yml:124`). Puede usar fallback de demanda, pero esta tarea no auditó las ejecuciones recientes.
- Hay filtros de modelos, variantes, precios positivos y outliers. No encontré referencias de integración de Jev/TypeSafe en `src`.
- El armador acepta $400.000–$20.000.000 ARS, busca siete categorías y aplica reglas de socket, DDR, RAM y potencia aproximada (`src/lib/seo/budget-builder.ts`, `budget-build-compat.ts`). El catálogo de guías carga hasta 24 productos agrupados por categoría, con caché de cinco minutos.
- La UI distingue piezas del catálogo y faltantes, ofrece enlaces a tiendas y algunas alternativas. El query string conserva el monto, no una versión inmutable de los componentes y precios.

## Brechas que afectan la validez

1. **Identidad por oferta.** Comprobar SKU/modelo/variante entre el registro, el título de la tienda y la ficha final. La contradicción RTX 4060/5060 debe rechazarse con una regla; no requiere gastar una llamada a Jev.
2. **Frescura por oferta.** El armador y las comparativas no descartan ofertas por antigüedad de `lastUpdated` ni muestran su fecha. El TTL del caché no es la antigüedad del precio. La fecha editorial tampoco es una verificación comercial.
3. **Stock con evidencia.** FullH4rd asigna `in-stock` a resultados extraídos (`src/lib/scrapers/fullh4rd.ts:101`); Venex lo infiere del título salvo outlet (`venex.ts:108`). La comparativa sólo excluye `out-of-stock`, por lo que `unknown` puede ser elegible (`src/lib/seo/comparison-pricing.ts:20`). El armador aplica una regla más estricta.
4. **Presupuesto completo.** Faltan perfiles de uso, piezas reutilizadas, cambios manuales, guardado de una versión, exportación y revalidación a pedido. BIOS, conectores, dimensiones y refrigeración no quedan garantizados por las heurísticas actuales. Envío y forma de pago deben ser explícitos; un costo desconocido no debe contarse como cero.
5. **Trabajo de scraping acotado.** `search-live.ts:62` crea promesas que ya inician trabajo antes de pasarlas a `withConcurrencyLimit` en la línea 99. El límite posterior no controla el inicio de esas tareas. La corrección requiere crear funciones diferidas y verificar la concurrencia real, también en scrapers de plataformas. Hallazgo de inspección; no se hizo una prueba de carga ni se atribuye a esto un incidente observado.

## Uso real de Jev en esta evaluación

Se ejecutó una consulta a `mcp__jev__evaluate_options` con contexto mínimo del proyecto y de la oferta pública. La respuesta se conserva en `EVALUACION-JEV.json` junto con el contenido exacto enviado.

- Modelo: `jev-1.13.0`.
- Primer piloto seleccionado: revisión semántica de casos ambiguos de identidad/variantes después de las reglas, probabilidad 0,99 y confianza 0,99.
- Disponibilidad deducible del HTML contradictorio: `ambiguous`, probabilidad 1,0.
- Uso informado: 1.216 tokens de entrada y 101 de salida.

Estos valores describen el juicio de esa consulta. **No son una medición de precisión, un benchmark ni una verificación del stock.** Las alternativas y los datos entregados condicionan la respuesta. No hay evidencia todavía de que Jev supere las reglas del proyecto.

La herramienta disponible en Codex acepta contexto y preguntas cerradas. Incorporar Jev al sitio requeriría una integración de backend propia, credenciales del servidor, presupuesto de consumo, timeout y fallback. Su disponibilidad en esta conversación no lo incorpora automáticamente a la web.

## Propuesta de tres entregables

### 1. Catálogo confiable y piloto de Jev

Empezar con tres tiendas y una muestra propuesta de 50 ofertas de CPU, GPU y RAM. Confirmar modelo, URL, variante, precio, forma de pago, stock y hora de observación. Conservar evidencia breve o un identificador de la captura, versión del parser y motivo de rechazo.

Corregir primero contradicciones detectables con reglas, stock inferido y edad de cada oferta. Mostrar estados claros: verificada, pendiente, vencida o descartada. Preservar los datos originales para poder explicar el resultado.

Evaluar Jev sólo en los casos semánticos que quedan ambiguos, en lotes y sin influir inicialmente en el catálogo público. Incluir la opción “evidencia insuficiente”. Dividir ejemplos de ajuste y evaluación antes de cambiar criterios; comparar reglas solas frente a reglas más Jev. Medir asociaciones incorrectas, abstenciones, cobertura, latencia y consumo por caso. No convertir su confianza directamente en una etiqueta de precio verificado.

**Salida comprobable:** ninguna fusión de variantes incorrecta en la muestra revisada; ninguna oferta marcada verificada sin fuente y timestamp; stock desconocido no gana una comparación. Son criterios del piloto, no garantías estadísticas sobre todo el catálogo.

### 2. Presupuestos utilizables

Reutilizar `/guia/armar`. Incorporar monto, uso, resolución cuando corresponda, piezas existentes, restricciones y preferencia de tiendas. Aplicar compatibilidad con datos estructurados y separar incompatibilidad de dato faltante.

Generar alternativas como menor costo, menos tiendas y mejor ajuste al uso. La suma y las restricciones se calculan en código. Jev podría ordenar alternativas que ya pasaron esos controles si el piloto demuestra valor; no debe inventar benchmarks ni FPS.

Incluir refrigeración cuando sea necesaria, costo de envío conocido o pendiente, modalidad de pago, fecha por oferta, componentes faltantes y motivo de cada selección. Permitir cambiar una pieza, guardar una versión compartible, exportarla y volver a comprobarla. Un armado incompleto no se presenta como PC lista para comprar.

**Salida comprobable:** un presupuesto completo con enlaces, desglose, restricciones y fecha; el total se reproduce a partir de sus líneas. Un cambio de precio crea una nueva versión y se informa al usuario.

### 3. Comparación actualizada a pedido

Responder las búsquedas con el catálogo y su antigüedad. Al pedir actualización de una comparación o presupuesto, encolar sólo las ofertas seleccionadas, deduplicar trabajo y procesarlo en un ejecutor separado del Worker público. La UI muestra pendiente, en proceso y resultado con hora por tienda. Actualizar la interfaz no equivale a actualizar la fuente.

Si se busca mantener infraestructura sin gasto nuevo, medir primero el trabajo por tienda y la cuota disponible. GitHub Actions puede servir para lotes; su programación puede retrasarse y no ofrece una promesa de respuesta inmediata. Un ejecutor local es otra posibilidad si existe un equipo disponible y encendido; esta evaluación no asume ese servicio.

**Salida comprobable:** demostrar un ciclo completo solicitud → lectura de tienda → validación → persistencia → cambio visible. Medir latencia y porcentaje de ofertas actualizadas; fijar el compromiso de frescura después de esa medición. No prometer “tiempo real” para todo el catálogo con el cron diario actual.

## Verificación ejecutada y límites

Pasaron 81 pruebas existentes en siete archivos: builder, compatibilidad, precios de guías, precios de comparativas, ranking, deduplicación y utilidades de precios. No se escribieron tests nuevos ni se ejecutó un build porque no se modificó código de producto.

Las pruebas públicas confirman las respuestas y casos descritos; no prueban todas las tiendas, toda la compatibilidad ni una tasa general de error. El estado de Cloudflare histórico no se presentó como falla actual: las rutas muestreadas respondieron 200.

## Fuentes externas verificadas

- [TypeSafe: introducción y primitivas](https://docs.typesafe.ai/introduction): decisiones estructuradas sobre estado proporcionado.
- [TypeSafe: Choice](https://docs.typesafe.ai/primitives/choice): elección entre alternativas y formato de resultados.
- [TypeSafe: confianza](https://docs.typesafe.ai/confidence): límites y ajuste con datos del dominio.
- [Cloudflare: límites de Workers](https://developers.cloudflare.com/workers/platform/limits/): Workers Free limita CPU por petición; separar el scraping pesado de la respuesta pública.
- [GitHub: eventos programados](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): ejecuciones programadas pueden retrasarse o descartarse bajo carga.
- [XT-PC: destino verificado](https://www.xt-pc.com.ar/prod/30551/placa-de-video-geforce-rtx-5060-8gb-gigabyte-eagle-oc): evidencia de identidad y condiciones del precio observado.
