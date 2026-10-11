# RAM y alcance de la base completa — 11/10/2026

## Resultado y límite

Se conserva la copia Mac completa: 59.692 productos, 73.827 ofertas, 34 tiendas. Se corrigieron dos asociaciones LionTech a la publicación Corsair BLACK CL38 con evidencia pública y binding existente validado. La reparación no renovó precio, stock ni fecha; la nueva observación siguió su flujo separado. No se tocó Supabase remoto ni la página pública; FullH4rd continúa diferido.

La prueba RAM reconoce datos explícitos que antes rechazaba (Single, Grey y alias de formato/color), sin inventar campos omitidos ni modificar claves persistidas. Antes había 14 destinos RAM admitidos; después de reparación y nueva prueba hay 110. Ser admitido sólo habilita un intento, no acredita lectura exitosa.

Se encolaron 110 destinos RAM; se intentaron 99 en cinco lotes. Resultado: 35 observaciones nuevas, 17 comparables por precio/stock/identidad, 64 fallos y 70 solicitudes HTTP. Son 24 publicaciones observadas y 9 comparables distintas: varias filas locales repiten una publicación. Hubo además cinco lecturas de descubrimiento. Los fallos conservaron precio, stock y fecha. Las 35 pruebas persistidas se revalidaron con el contrato final y ambas bases pasan integridad y claves foráneas.

| Tienda | Intentos | Observaciones | Comparables | HTTP |
|---|---:|---:|---:|---:|
| MaxTecno | 51 | 9 | 9 | 34 |
| LionTech | 22 | 18 | 8 | 15 |
| GoldenTech | 14 | 8 | 0 | 9 |
| Gaming City | 7 | 0 | 0 | 6 |
| CompraGamer | 2 | 0 | 0 | 3 |
| Katech | 1 | 0 | 0 | 1 |
| Hardcore | 1 | 0 | 0 | 1 |
| SCP Hardstore | 1 | 0 | 0 | 1 |

Los dos 403 de Hardcore/SCP eran evitables: la muestra ya tenía pausas y la copia completa no. Se incorporó salud compartida entre copias; sólo extiende bloqueos, sin copiar precios ni saltar backoff. Una caché CompraGamer anterior al lease sigue sin acreditar observación nueva.

## Qué significa actualizar toda la base

La Mac puede recorrer toda la copia. El límite actual es cobertura de fuentes/identidad y costo de guardar los cambios, no poder abrir 73.827 filas. Capacidad del consumidor local después del cambio:

| Familia | Ofertas guardadas | Admitidas para intento |
|---|---:|---:|
| Procesadores | 5.683 | 2.599 |
| GPU | 5.672 | 2.412 |
| RAM | 7.160 | 110 |
| Almacenamiento | 6.183 | 865 |
| Motherboards | 6.447 | 0 |
| Fuentes | 3.440 | 0 |
| Gabinetes | 3.811 | 0 |
| Refrigeración | 3.001 | 0 |
| Computadoras | 13.412 | 0 |
| Periféricos | 19.018 | 0 |
| **Total** | **73.827** | **5.986 (8,1%)** |

Quedan 67.841 fuera de la capacidad validada: 35.447 por familia no habilitada, 21.334 por tienda no habilitada y 11.060 por destino/atributos. Son motivos excluyentes del selector; no equivalen a productos inexistentes. RAM omite kit, CL y formato en gran parte de sus títulos. Faltan terminación, deduplicación, fuentes de todas las familias y actualización demostrada para afirmar cobertura completa. Las filas de staging acumuladas tampoco son inventario actual de una tienda.

La comparación de identidad/stock de 17 filas no significa 17 fichas visibles. La búsqueda local con filtro de precio devuelve cuatro modelos Kingston y uno Corsair SODIMM al pedir ese formato. Corsair GREY y Kingston RGB todavía tienen su oferta nueva en una copia diferente de la ficha preferida de esa identidad, y el filtro no los muestra. Hay que resolver esa asociación entre copias antes de contabilizarlos como recuperados en búsqueda. No se cambió el contrato de preferencia para ocultar el problema.

## Cloudflare: medición y protección

La muestra cerrada mantiene 1.012 productos/1.366 ofertas y cero destinos RAM admitidos. Las 35 observaciones del barrido completo siguen en la Mac; el transporte actual rechaza membresía nueva. No se acreditó búsqueda RAM remota con estas observaciones.

Con caché vencida, siete consultas coinciden con SQLite y cuestan 8.270 lecturas D1 en total, con 482–3.050 por consulta. Se recalculó la proyección local sin modificar observaciones; el delta privado modificó cuatro proyecciones y confirmó 16 escrituras reales. Con caché vigente, las siete consultas vuelven a coincidir: 4.253 lecturas en total. Tres repeticiones HIT usaron una lectura cada una y tardaron 143–235 ms. Las MISS cuestan 107–2.481 lecturas; no proyectar el consumo de HIT sobre todo el tráfico.

El siguiente reinicio del ciclo confirmó dos observaciones más (Katech stock desconocido y Dinobyte agotado), ambas no comparables, y 43 escrituras D1. Hubo un 404 sin renovar el precio. El marcador remoto coincide con SQLite después de esa sincronización y cuatro consultas posteriores conservan paridad. Escrituras nuevas confirmadas en este tramo: 16 de mantenimiento + 43 de observaciones = 59. Se conservó una reserva anterior de 4.000 escrituras inciertas; no se liberó por suposición.

Analytics del piloto a las 19:01:10 UTC: 353.196 lecturas y 23.925 escrituras acumuladas del día; Workers 327 solicitudes, cero errores, CPU p50 1,241 ms/p99 8,579 ms. Analytics tiene demora y no incorpora necesariamente los últimos recibos: no sumar sus diferencias como una medición exacta de este turno ni confundir la base piloto con el consumo de toda la cuenta. El [plan D1 Free](https://developers.cloudflare.com/d1/platform/pricing/) admite 5 millones de lecturas y 100.000 escrituras diarias; [Workers Free](https://developers.cloudflare.com/workers/platform/limits/) limita CPU a 10 ms. Esta muestra no demuestra margen para el catálogo completo ni tráfico real.

La caché puede vencer entre ciclos de 15 minutos, especialmente si no hay observaciones exitosas que recalculen la proyección. Este turno acredita el mantenimiento explícito y la vuelta segura al camino de respaldo; aún falta mantenimiento automático del reloj independiente del resultado de las tiendas.

Producción conserva exactamente despliegue `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977`, modificación `2026-10-10T22:55:51.363775Z` y el mismo ETag. No hubo push, deploy público, ampliación del piloto ni contratación. El LaunchAgent quedó reactivado cada 900 segundos, con máximo 200 intentos/400 HTTP/20.000 escrituras remotas diarias y vencimiento original 12/10 a las 15:03:10 UTC (12:03 Argentina). Es un ensayo de 24 horas, no un servicio permanente; la Mac debe estar encendida y conectada.

## Verificación, recibos y siguiente prioridad

193/193 Vitest en seis suites; 28/28 Node para consumidor agrupado y cola/pausas; 23/23 Node de ciclo, transporte y proyección. Typecheck sin errores; lint de archivos TypeScript sin errores. El lint de refresh-demand conserva una advertencia previa en el contador condicional; no se introdujo otra. Revisión independiente de RAM, agrupación y pausas sin hallazgos materiales.

Recibos privados: `outputs/ram-cuarta-recuperacion-2026-10-11/`: baseline, reparación Lion, barrido completo, auditoría de persistencia, búsqueda, caché vencida/vigente y ticks de reinicio/mantenimiento. Medición Cloudflare: `ram-cuarta-inicio.json` y `ram-cuarta-cierre-definitivo.json` en el directorio del ciclo. No versionar bases, secretos ni recibos completos.

Prioridad: corregir copias preferidas que ocultan ofertas válidas; ampliar una muestra RAM con importación acotada y atómica; mantener el reloj de proyección automáticamente; luego completar fuentes estructuradas y lectores por familia con paginación/terminación. El inventario completo se recorre por etapas y la observación frecuente se prioriza por demanda. No prometer refrescar cada publicación individual de toda la base cada día con el ensayo limitado a 200 intentos.

Reversión del código: retirar prueba RAM (volver al gate anterior), consumidor agrupado y helper de pausas por unidades. Para revertir datos, detener writers y restaurar copias coherentes completas; restaurar sólo precios rompería bases/proyección/caché. El mantenimiento confirmado en el piloto requiere un delta nuevo y marcador esperado, no cambiar el marcador remoto a mano.
