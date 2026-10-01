# Actualización de precios sostenible

Fecha: 01/10/2026. Propuesta basada en código, configuración activa, datos agregados de Supabase, ejecuciones de GitHub y una lectura pública de CompraGamer. No modifica la regla de frescura ni los horarios productivos; no ejecuta refresh ni cambia precios.

## Decisión propuesta

Usar GitHub Actions para consultar las tiendas y Supabase para persistir observaciones. Cloudflare sirve el sitio, lee el catálogo y encola solicitudes acotadas. No hace falta mantener encendido el Mac.

Separar tres conceptos: frecuencia objetivo de consulta, antigüedad admitida para mostrar/comparar el precio e identidad/precisión de la oferta. Ampliar la antigüedad no sustituye una consulta a la tienda ni resuelve un precio extraído de la sección equivocada.

| Uso | Objetivo de consulta | Tratamiento propuesto |
|---|---|---|
| Selección prioritaria del catálogo de tiendas verificadas | Completar cobertura dentro de 24 h; recorrer por lotes durante el día | Admitir observaciones de hasta 24 h, indicando fecha y condición de pago. Mostrar las anteriores como referencia |
| Productos consultados, favoritos y alertas | Cada 2–3 h mientras exista demanda; compartir una consulta entre usuarios | Dar prioridad a la oferta y ofrecer revalidación si supera la ventana |
| Guías y armador con total confirmado | Conservar revisión anticipada desde 90 min y solicitud acotada cuando sea necesaria | Mantener 3 h para confirmar siete ofertas y el total; conservar referencia cuando falte verificación |
| Resto del catálogo con poco interés medido | Revisión de mantenimiento cada 3–7 días, o bajo demanda; aprovechar lecturas conjuntas | Una observación de más de 24 h sigue siendo referencia histórica; la frecuencia de mantenimiento no amplía su vigencia |

La ventana de 24 h del catálogo sería un cambio deliberado de producto. Debe tener un contrato propio y texto visible: «Relevado hace …», sin prometer precio en tiempo real. No cambiar globalmente `OFFER_FRESH_MS`: hoy ese valor también protege guías, armador, comparativas y datos estructurados. Si se decide ampliar esos usos, revisar sus promesas y pruebas en conjunto.

### Criterio de selección, revisado con Jonathan

El objetivo de 24 h se concentra inicialmente en componentes de PC con interés y uso demostrables, no en todas las filas históricas. Primer nivel: piezas de las tres guías, alternativas compatibles necesarias y solicitudes explícitas del armador. Segundo nivel: CPU, GPU, RAM, SSD, mothers y fuentes con búsquedas, vistas o clics hacia tiendas de usuarios distintos; gabinetes/refrigeración entran por guías o interés observado. Monitores, teclados, mouses y mousepads pueden subir de nivel por esa misma evidencia. El precio alto no es un criterio suficiente para incluir o excluir un producto.

La prioridad programada actual protege las guías y nueve fichas fijas de prueba: Ryzen 5 5600, Core i5 12400, Ryzen 5 7600X; RTX 5060 Gigabyte Eagle, MSI Shadow y ASUS Dual; tres fichas de RAM Corsair/Kingston. Esa muestra es diagnóstica, no el ranking de demanda. El cron no ejecuta automáticamente un ranking general de demanda.

GA4 consultado en esta revisión, período 12–30/09/2026 y país Argentina: `/comparar/placas-de-video` 33 vistas/22 usuarios; procesadores 20/15; almacenamiento 9/4; fuentes 6/3; RAM 6/6; mothers 6/6; periféricos 3/3. Son señales registradas, no usuarios humanos verificados ni compras. Los seis eventos globales `view_search_results` y catorce `view_item` del período resultan insuficientes para un ranking comercial firme. El filtro de IP activado el 01/10 no limpia retrospectivamente nuestras pruebas.

La cola de demanda tiene 220 términos/categorías no vencidos, incluidos ocho de periféricos (teclados, monitor, joystick, silla y auriculares). También contiene pruebas como `producto-inexistente-testsprite-9382`. Sus contadores no representan todas las búsquedas: se escriben cuando hay resultados vencidos o ausencia de resultados, se limitan a 100 y no distinguen personas/bots. No usarlos directamente como popularidad.

La marca actual `hot` tampoco equivale a popularidad: procede de tener stock informado y al menos tres ofertas; `tracked` depende de favoritos/alertas. Una ficha de mouse puede ser hot con el mismo criterio que una CPU. El detalle individual no escribe demanda y GA4 es un circuito separado. La implementación debe conectar señales de interés agregadas con la selección, sin reinterpretar esos campos como si ya midieran personas interesadas.

Para elegir candidatos, usar una ventana de siete días y revisar la selección semanalmente: reservar primero guías/solicitudes; priorizar después clics hacia tienda, favoritos/alertas, búsquedas y vistas, contando usuarios/sesiones distintos y agrupando términos equivalentes. Excluir pruebas identificables y limitar repetición; no llamar humana a una visita solo por tener engagement. Con pocos datos, mantener una selección editorial acotada y considerar una visita/vacío de búsqueda como señal para una comprobación puntual, no para un scan permanente. Si una consulta conjunta trae periféricos, aprovecharla donde el adaptador sea fiable; no iniciar detalle por detalle sin una razón. La escritura/procesamiento también tiene costo aunque la descarga sea compartida.

## Evidencia actual

- Consulta de Supabase a las 17:30:06 UTC / 14:30:06 de Santiago: 60.781 filas de ofertas; 71 observadas dentro de 24 h (0,117%); ninguna dentro de 3 h; 60.710 anteriores a 24 h. Última observación: 13:21:18 UTC. Son filas almacenadas, no productos únicos ni disponibilidad actual demostrada.
- La ventana de 24 h recuperaría esas 71 filas en este corte. No rejuvenecería las otras 60.710. También siguen aplicando identidad, stock y precio positivo.
- En la ejecución `36855886672`, el proceso prioritario consultó 86 destinos, persistió 71 observaciones, obtuvo 19 comparables y dejó una pieza de guía sin cobertura. El refresco tardó 6 min 43,5 s; el job completo, 7 min 31 s. Un job verde no demuestra cobertura del catálogo entero.
- La ejecución posterior `36886339575` del proceso bajo demanda terminó correctamente pero omitió el scraping porque la cola estaba vacía. La anterior `36885488052` terminó con estado failed sin ofertas verificadas. No contar ambos estados como actualizaciones exitosas de precios.
- El workflow publicado en `main` coincide con el archivo local: prioridad diaria a las 05:05 UTC y guías en el minuto 17 de las otras horas. Las ejecuciones recibidas muestran huecos de varias horas. Los horarios configurados son objetivos, no evidencia de ejecución puntual.
- Variables activas del Worker verificadas por la API: `DISABLE_LIVE_SCRAPING=1`, `DISABLE_INTERNAL_BACKGROUND_REFRESH=1`, `CATALOG_REQUESTED_RUNNER=0`, `ENABLE_ON_DEMAND_REFRESH=1`. GitHub tiene activados on-demand y la revisión Jev.
- La lectura pública `https://static.compragamer.com/productos` devolvió 1.450 IDs distintos en 2.114.774 bytes y 6,67 s de transferencia en este Mac. El catálogo contiene campos de precio especial/lista, stock y código principal. Esto demuestra la posibilidad de lectura conjunta; no certifica individualmente las 1.450 ofertas ni el rendimiento desde GitHub.
- Comprobación posterior del mismo día: otra descarga del listado devolvió 1.467 IDs distintos: 1.338 con `es_outlet=false` y 129 con `es_outlet=true`; dos registros no vendibles. Los 14 enlaces de productos comprobados en la página visible, incluyendo combos de notebook/mouse, estaban presentes en la descarga. El número varía entre lecturas. Es el alcance observado del listado público, no una certificación del inventario histórico completo ni de todas las publicaciones fuera de ese listado.
- En la base, CompraGamer tiene 4.882 filas de oferta y 3.238 URLs distintas. Hay duplicación de destinos vinculados a fichas; no equivale a 4.882 solicitudes necesarias. La diferencia respecto al listado público tampoco demuestra por sí sola agotamiento o retirada: hay que verificar referencias estables y alcance del listado.

## Costos y límites comprobados

- Workers Free publica 100.000 requests/día, 10 ms de CPU por invocación HTTP o cron, 128 MB y 50 subrequests por petición. La espera de red no consume CPU, pero parsear HTML/JSON sí. No usar el Worker gratuito como motor del barrido completo. Fuente: https://developers.cloudflare.com/workers/platform/limits/.
- El repositorio es público y usa `ubuntu-latest`, un runner estándar. GitHub documenta ejecución gratuita para repositorios públicos con runners estándar; almacenamiento de artefactos/caché tiene cuotas propias. No activar runners grandes. Fuente: https://docs.github.com/en/billing/concepts/product-billing/github-actions.
- GitHub advierte que los schedules pueden retrasarse y algunos jobs descartarse bajo carga. Conservar recuperación, cola persistente y medición de edad real. Fuente: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule.
- La API confirmó configuración del Worker, pero no permitió leer suscripciones (error de autenticación). Los límites anteriores corresponden al plan gratuito indicado por Jonathan; esta sesión no confirmó independientemente la suscripción de Workers.
- Supabase sigue siendo parte del presupuesto: tamaño medido de base 672.558.227 bytes (~641,4 MiB), incluyendo tablas e índices. `api_cache_entries` ocupa ~232 MiB y tiene 343.958 filas vencidas de 344.379. Antes de ampliar escrituras, verificar cuota real y diseñar mantenimiento de caché; estos números no acreditan el plan contratado y no se borró nada.

## Arquitectura de la actualización

1. **Lectura conjunta por tienda.** Obtener un feed/catalogo público cuando ya esté disponible y validado, como CompraGamer. En tiendas HTML, recorrer páginas por categoría con cursor persistente. No aumentar ciegamente los topes actuales: Mexx tiene hasta cinco páginas por categoría y WooCommerce cuatro; un modo llamado full no acredita que haya recorrido todas las publicaciones.
2. **Identificación estable.** Vincular la observación por tienda y referencia exacta de publicación/variante; usar SKU cuando la tienda lo informe. Una URL presente en varias fichas se consulta una vez y conserva la revisión de cada vínculo. RGB/Black, EVO, Advanced, capacidad o kit distintos no se fusionan por similitud de nombre.
3. **Cola con avance guardado.** Registrar tienda/categoría/cursor, próximo intento, último intento y última observación válida. Una ejecución retoma el avance anterior. Los destinos prioritarios tienen una vía acotada reservada para no esperar el barrido general. Diseñar los grupos de concurrencia para que no queden bloqueados por lotes generales largos.
4. **Lotes acotados.** Punto de partida propuesto: invocación horaria, presupuesto de 10–15 min para el lote general, hasta tres lecturas activas globales y una por tienda, separación mínima de 2 s por fuente. Es un presupuesto inicial para medir, no una capacidad verificada. Conservar timeout, backoff y respeto a 403/429; no intentar eludir bloqueos.
5. **Persistencia fiel.** Registrar la hora de respuesta real o revalidación válida del recurso que contiene precio/stock. La caché local mantiene su hora original. Precio sin cambios renueva la observación real, pero no genera artificialmente un cambio de precio en el historial. Un fallo registra el intento y motivo, conserva el valor previo y su antigüedad. No usar updatedAt del producto como observación de una oferta.
6. **Precisión antes de escala.** Usar el precio del producto principal, moneda y condición explícita de pago. Guardar por separado transferencia/efectivo, lista y cuotas/total cuando estén informados. No inferir stock por precio positivo ni asumir que una cuota es el total. Descartar bloques de recomendaciones. Una baja grande genera revisión y una nueva comprobación; no rechazar descuentos reales solo por un umbral.
7. **Disponibilidad histórica.** Un listado incompleto o una publicación ausente no implican out-of-stock. Conservar evidencia de alcance, reintentar y consultar detalle cuando corresponda. Proponer retiro del catálogo activo solo con evidencia suficiente; mantener historial y evitar borrar masivamente registros.

Con el bucle secuencial actual y su espera de 2 s por destino, revisar 60.781 filas requeriría al menos 33,77 h solo en esperas, antes de descargar o revisar identidad. Ese cálculo no es una estimación del sistema por lotes: muestra por qué no sirve ampliar simplemente el mismo bucle a todo el catálogo.

## Implementación ordenada y criterio de avance

1. Integrar las correcciones ya preparadas de extracción WooCommerce y orden de búsqueda antes de multiplicar observaciones. La publicación anterior sigue pendiente de la respuesta a su solicitud de aprobación.
2. Probar el primer adaptador de lectura conjunta con CompraGamer y una selección fija de publicaciones existentes. Medir tiempo, bytes, stock, SKU/modelo, pago, vínculos duplicados y observaciones guardadas. No usar el resultado para habilitar pendientes de identidad.
3. Incorporar un recorrido reanudable por páginas en una tienda WooCommerce cuyo precio principal/stock/variantes se hayan contrastado en detalle. Comparar listado y ficha. Ampliar a otras plantillas después de esa validación.
4. Separar la política de 24 h del catálogo de la política de guías/armador; actualizar etiquetas, ranking, comparativas afectadas y JSON-LD de forma consistente. No declarar priceValidUntil como garantía de vigencia a partir del tiempo de observación.
5. Aumentar tiendas por etapas según cobertura demostrada. La meta propuesta es ≥95% de ofertas activas distintas de la selección prioritaria observadas dentro de 24 h en cada tienda incorporada, medida durante siete días. Publicar el alcance y la lista de esa selección. Informar aparte cobertura de todo el catálogo almacenado, ofertas comparables, pendientes y fallos; no reducir el denominador de la selección para ocultar tiendas que fallan.
6. Revisar capacidad después de siete días: duración y éxito por tienda, cola atrasada, requests/bytes, bloqueos, escrituras y crecimiento de base/historial/caché. Ajustar frecuencias con esa evidencia. Pagar infraestructura o depender del Mac no es el primer paso.

## Seguimiento mínimo

Persistir por ejecución y tienda: inicio/fin, alcance/cursor, intentadas, observadas, comparables, ausentes, fallidas y motivo; requests/bytes, duración, edad del pendiente más viejo y fecha del último barrido completo. Publicar cobertura ≤3 h/≤24 h y antigüedad por tienda en el panel operativo existente.

Los artefactos actuales de GitHub (30 días) ya permiten auditar el piloto, pero no sustituyen la cola y el avance persistente. Evitar guardar HTML completo de cada consulta o agregar una fila de historial de precio en cada lectura sin cambio. Mantener evidencia resumida suficiente para explicar qué precio se seleccionó y de qué bloque/condición provino.

### Referencias locales comprobadas

- `.github/workflows/catalog-refresh.yml`, `.github/workflows/requested-offer-refresh.yml`.
- `scripts/run-catalog-refresh.mjs`, `scripts/catalog/refresh-entry.ts`, `scripts/catalog-freshness-report.mjs`.
- `src/lib/catalog/priority-refresh.ts`, `priority-planning.ts`, `on-demand/worker.ts`, `on-demand/dispatch.ts`.
- `src/lib/price-freshness.ts`, `src/lib/persistence/product-write-dedupe.ts`.
- `src/lib/scrapers/source-http.ts`, `compragamer-catalog.ts`, `compragamer.ts`, `compragamer-mapper.ts`, `mexx.ts`, `woocommerce-shared.ts`.
- Auditoría previa: `CATALOGO-AUDITORIA-Y-CORRECCIONES-2026-10-01.md`.
