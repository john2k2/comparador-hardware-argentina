# Plan de dirección del Comparador — 07/10/2026

**Decisión recomendada: dedicar las próximas dos semanas a conseguir ofertas útiles que se mantengan actualizadas, recorridos que se recuperen de los fallos y evidencia de uso externo.** Comparar componentes y armar una PC conservan igual prioridad. Presupuesto de servicios: cero. Máximo tres entregas abiertas, coordinadas desde el chat de dirección.

Pedir “optimizar todo” no define un resultado ni un punto de cierre. El proyecto ya tiene suficientes funciones para probar su utilidad. El riesgo actual es seguir agregando catálogo, automatizaciones y ajustes mientras una parte grande de las ofertas prioritarias sigue pendiente. Cada cambio nuevo debe mejorar una de las tres entregas siguientes o esperar.

## Dónde estamos, con evidencia fechada

| Hecho | Qué permite concluir | Qué queda abierto |
|---|---|---|
| Candidata `527cd6b` publicada el 07/10; Workers Build y CI aprobados; 32 comprobaciones públicas y confianza escritorio/móvil pasaron | Las seis reparaciones operativas revisadas están publicadas y los recorridos representativos funcionan en ese corte | Cobertura continua, CPU y capacidad no se deducen de tests/HTTP 200 |
| Monitor existente actualizado: 48.170 → 9.584 caracteres guardados; mismo ID, horario y permisos | Menos instrucciones históricas que reconstruir, sin un segundo monitor | El monitor informa; no recupera ofertas por sí solo |
| Guías natural 37652691808, 16:32 UTC: 10 observaciones comparables, 9 slots pendientes; muestra fija 0/9 productos corroborados ≤3 h | Hay lecturas reales, con huecos de utilidad identificados | No demuestra PC completa, 95% ni ciclo diario útil G02 |
| DB de lectura 17:41:51 UTC: 929.836.179 bytes; caché 245.432.320; historial 176.480.256 | La capacidad sigue siendo una restricción concreta | Incluso descontando hipotéticamente toda la caché quedarían 684.403.859 bytes |
| GA4 oficial consultado en dos períodos y por eventos, retorno, países y canales | Hay señales registradas de uso y vuelta | Los agregados de cuenta se conservan en el informe local; no demuestran compradores externos ni retención de cohorte |

La medición distingue recepción de eventos, uso externo y retención por cohorte. Los segmentos new/returning pueden solaparse; no sumar usuarios ni tratarlos como retención de cohorte. El período anterior no devolvió una fila: no se presenta como crecimiento/caída ni cero verificado. Filtros de tráfico interno e identidad cross-device requieren contraste separado. Los agregados y recibos detallados se conservan localmente. Las pruebas de esta entrega bloquean sus solicitudes de analytics.

## Las tres entregas que ordenan el trabajo

| Orden | Resultado de usuario | Responsable | Cierre exigido |
|---|---|---|---|
|1|Encontrar ofertas comparables útiles y poder cotizar las siete piezas cuando existan ofertas elegibles|Catálogo y performance, con ingeniería|Reparar las causas de la matriz de 36 fuentes por demanda y piezas faltantes; conservar nueve productos fijos, fechas/stock/variante y denominador del 95%; observar ciclos naturales priority útiles según G02, sin sumar guides/manuales; capacidad con bytes y restauración comprobables |
|2|Comparar dos productos y usar el armador sin perder selección ni confundir fallos con ausencia de resultados|Producto, ingeniería y revisor|Reloj del total, fallo/reintento y mínimo vencido revisados; consultas simultáneas comparten sólo trabajo equivalente; pruebas reales con estilos en escritorio/390 px, incluyendo recuperación y fechas |
|3|Saber quién obtiene utilidad y vuelve, dentro del presupuesto cero|Medición y dirección; crecimiento aporta un solo experimento|Línea base agregada, recepción real de eventos, revisión de consentimiento/tráfico interno y una cohorte externa de uso |

La entrega 1 es el cuello de botella comercial: una consulta más rápida no compensa ofertas sin precio comparable actual. La entrega 2 protege confianza y reduce trabajo innecesario del backend. La entrega 3 evita tomar decisiones de crecimiento con nuestras propias pruebas. Estas entregas comparten datos y reglas; no se asigna 50% de las horas a cada recorrido por contar pantallas.

## Optimización técnica: qué aplicar y qué medir primero

| Prioridad | Acción | Evidencia y decisión |
|---|---|---|
|Aplicada/publicada|Guardas de borrado de caché, ACK de persistencia, espera acotada del scheduler, proyección de seis columnas, recibo de child interrumpido, omisión del diagnóstico global en guías horarias|Informe [automatizaciones](../automatizaciones-codigo-2026-10-07/README.md); sin atribuir reducción de DB, CPU o latencia productiva |
|Revisada y verificada; publicación en cierre|Invalidar búsqueda cacheada si vence su mínimo; cotización del armador con reloj/resume; errores/reintento A/B; lectura pendiente compartida de búsqueda normal|Cinco unidades revisadas; lint/tipos, 1.985 unitarias, 41 operativas, 13 recorridos con estilos y build OpenNext aprobados en a149fc2. La publicación final y sus comprobaciones tendrán recibo separado |
|Siguiente corrección aislada|La ficha convierte excepción DB en notFound|Distinguir ausencia real de indisponibilidad; preservar status de recuperación y metadata. Alcance separado por efectos SEO/server; [evidencia producto](componentes-producto.md) |
|Medir antes de cambiar|Concurrencia/preflight de requested, batching de telemetría, auth/layout, carga de candidatos por pieza, lazy loading|Comparar llamadas, tiempo por fase, bytes y fallos con una reproducción controlada. No se demostraron como causa dominante; no cambiar cadencias por intuición |
|Mantenimiento acotado|Comando cache:warm roto e índice duplicado pequeño|Corregir su entrada/test local cuando corresponda. No ejecutar calentamiento productivo ni retirar índices como consecuencia automática |

Conservar Next 16/OpenNext, runners GitHub y Supabase mientras se prueban estas reparaciones. No hay evidencia de que una reescritura de framework, microservicios o nuevos agentes mejoren primero la utilidad. Los informes [consultas](consultas-actualizaciones.md) y [componentes](componentes-producto.md) separan defectos, hipótesis y límites. Los 221–236 KB gzip calculados del manifiesto por ruta no son transferencia observada ni INP. La reducción N→1 en fixtures de un proceso no garantiza deduplicación entre isolates.

## Capacidad: decisión incómoda que debemos preparar bien

El plan Free admite 500 MB de base; distingue tamaño de datos e índices del disco total. La base actual supera ese límite. PostgreSQL puede reutilizar espacio borrado sin devolverlo al sistema; un borrado contado no prueba reducción física. [Supabase](https://supabase.com/docs/guides/platform/database-size), [PostgreSQL](https://www.postgresql.org/docs/current/routine-vacuuming.html).

**Recomiendo cerrar primero el presupuesto de bytes y la restauración de la retención ya preparada.** Exigir exportación/restauración comprobada, tamaño antes/después y un presupuesto de operación. La ventana ya leída de 1000 filas contenía 36 candidatas; no permite extrapolar todo el historial. El piloto anterior borró 1000 eventos de caché y no acreditó reducción física. Su autorización está consumida.

Descontar hipotéticamente caché e historial completos dejaría 507.923.603 bytes (≈508 MB decimales), antes de crecimiento y margen. Eso no autoriza a eliminarlos y no demuestra operación sostenible dentro del límite nominal. Si la combinación segura de retención y reducción de datos activos no llega al objetivo con margen, avanzar al diseño de archivo frío; no insistir en lotes de borrado a ciegas.

| Alternativa | Ventaja | Costo/riesgo y condición |
|---|---|---|
|Retención segura en la arquitectura actual|Menor cambio y conservación de contratos|Recuperación física insuficiente o bloqueo/espacio temporal. No ejecutarla antes de demostrar restauración y revisar la operación concreta |
|Base reducida para datos activos/de usuario; archivo frío separado para histórico/derivables|Puede desacoplar utilidad actual del crecimiento acumulado|Requiere diseño, cuotas verificadas, recuperación, lecturas compatibles y migración revisada. Estudiar sólo si la reducción segura no permite operar debajo de 500 MB con margen |
|Cambiar de plataforma o pagar|Puede ampliar capacidad|Fuera del presupuesto confirmado; migrar toda la plataforma agrega mantenimiento. No resolverlo antes de cuantificar los datos que necesitamos conservar |

Propongo 450 MB como objetivo operativo con margen, no como regla del proveedor ni promesa de reducción. Con costo cero debemos controlar el ingreso de datos y priorizar ofertas útiles; ampliar 105 categorías ahora agrava el problema. No cambiar denominadores ni retirar silenciosamente productos de la muestra para aparentar 95%. Cualquier reducción de alcance visible debe quedar como decisión explícita, conservando la historia del indicador.

## Crecimiento durante estos 90 días

Mantener SEO útil sobre productos, comparación y PC verificables. Posponer ampliaciones de categorías, benchmarks sin fuente, nuevas integraciones comerciales y rediseños generales. Conservar el piloto Eneba y las guías con sus límites ya autorizados; clic no equivale a venta y una guía no se renueva editorialmente cada día. El presupuesto del armador sigue siendo exacto; las guías admiten 10% entre revisiones según la decisión vigente.

**Experimento recomendado para las próximas dos semanas:** Jonathan consigue 10 sesiones voluntarias de personas que realmente estén evaluando hardware, cinco por recorrido. Dirección prepara las tareas y observa sin enseñar dónde pulsar: encontrar una oferta elegible del modelo correcto, entender pago/frescura, volver tras un fallo, y en PC reconocer pendientes/compatibilidad y total. Registrar resultados anónimos, obstáculos y motivo de volver a los 7 días. No publicar/contactar desde los agentes sin instrucción.

Son objetivos de evaluación propuestos: 8/10 personas completan su tarea sin ayuda; cero recomendaciones de variante incorrecta o total falso; al menos 3 regresan por una necesidad concreta. Diez casos son una prueba cualitativa, no validación estadística ni retención poblacional. Si las ofertas impiden completar la tarea, recuperar ese dato antes de atraer más tráfico. Si la utilidad se sostiene y nadie vuelve, investigar frecuencia de compra, alertas/favoritos existentes y motivo de regreso antes de añadir funciones.

## Agenda ejecutable y control

| Período propuesto | Trabajo | Decisión al terminar |
|---|---|---|
|Esta entrega 07/10|Publicación aprobada+monitor; reparaciones pequeñas; estudio y centralización de estado|Qué está publicado, qué está probado y qué sigue pendiente, con recibos |
|08–14/10|Recuperar slots/identidad/fuentes prioritarias, preparar capacidad recuperable y reproducir los fallos del recorrido|Conservar o ajustar cada reparación por evidencia; no cerrar G02 por calendario |
|15–21/10|Sesiones externas y revisión de vuelta; un experimento de adquisición sobre un recorrido comprobable|Escalar sólo el canal que trae uso útil, con atribución y consentimiento; detener el que atrae visitas sin utilidad |
|Cada semana hasta los 90 días|Una revisión de dirección de 30 minutos sobre utilidad, cobertura, retorno, capacidad e incidentes|Mantener/cambiar/posponer con una razón, un dueño y una condición de revisión |

Para las primeras 10 horas semanales sugiero 6 en catálogo/capacidad y pruebas de fuentes, 2 en recorridos, 1 en medición y 1 en el experimento/revisión. Es una distribución de trabajo propuesta, no una obligación ni nueva decisión de Jonathan. Mantener ambos recorridos mediante la misma base fiable. Una semana con una incidencia cambia esa distribución por decisión de dirección, no abre seis frentes nuevos.

Un responsable por entrega; especialistas Sol/high activados para encargos concretos, máximo dos en paralelo. El revisor conserva independencia. Chat de dirección y [README central](/Users/johnortiz/Documents/Proyectos/comparador-hardware-argentina/docs/direccion/README.md) definen prioridades; reportes conservan evidencia; el tablero existente refleja sólo cambios comprobados. No crear más chats ni tableros para compensar falta de foco.

En cada revisión respondemos cinco preguntas: ¿hay ofertas útiles reales?, ¿pueden completar ambos recorridos?, ¿vuelven usuarios externos?, ¿cabe la operación en costo cero?, ¿qué decisión cambia por lo aprendido? Un test verde cierra su contrato técnico, no estas cinco preguntas.

## Método y límites

Estudio coordinado sobre fuentes actuales, matriz de 36 tiendas, 32 scripts/6 workflows, reportes/estado de chats ya inventariados, código de recorridos, manifiestos, CI/publicación, DB de lectura y GA4 oficial. No afirma lectura de cada mensaje de cada cuenta ni medición de todo componente/tienda. Los especialistas trabajaron con ownership y revisión final del coordinador. No hubo compras, cambios de plan, borrado adicional, migración remota, índices, mantenimiento DB ni refresh manual.

La versión instalada de [grill-me](/Users/johnortiz/.agents/skills/grill-me/SKILL.md) remite a una herramienta Skill “grilling” que esta sesión no ofrece. Se preservan las respuestas ya confirmadas y se cuestionan los supuestos con evidencia disponible; no se atribuye una ejecución inexistente de esa herramienta. El grafo disponible es histórico y sólo orienta; las conclusiones se apoyan en fuentes de la copia vigente.
