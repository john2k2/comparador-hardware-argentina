# Tercera recuperación del catálogo — 11/10/2026

Trabajo local en `codex/busqueda-funcional`, copia `correcciones-auditoria-web`, y en el piloto privado existente de Cloudflare. Sin pagos, push a GitHub, despliegue de la página ni escrituras en Supabase. FullH4rd queda excluido del selector automático, incluso con demanda pendiente. No se eliminaron sus ofertas ni se renovaron sus fechas.

## Observaciones acreditadas

La base completa conserva 59.692 productos, 73.827 ofertas y 34 tiendas. Se guardaron 51 observaciones nuevas: 48 SSD de CompraGamer comparables y tres RAM no comparables. El piloto conserva 1.012 productos y 1.366 ofertas; recibió tres observaciones comparables adicionales.

| Fuente y alcance | Resultado de esta tanda |
|---|---|
| CompraGamer, base completa | 48 ofertas SSD, correspondientes a 26 publicaciones distintas; 48 comparables. Dos lotes reclaman antes de la captura compartida: seis solicitudes HTTP. Corte 17:25:03–17:26:19 UTC. |
| LionTech, base completa | RAM Corsair Vengeance 32 GB DDR5 6000 CL38, kit 2×16 negro: $991.557, sin stock. |
| GoldenTech, base completa | RAM 32 GB DDR5 6000 CL30 blanca RGB: $1.208.202; RAM 32 GB DDR5 5200 CL40 negra: $966.565. Ambas con stock desconocido, no comparables. |
| 37Bytes, piloto | Kingston NV3 1 TB SNV3S/1000G: $384.145, stock bajo. Precio por transferencia $314.998,90 separado, no usado como precio general. SKU 37000145 y variante pública con tres unidades. |
| Katech, piloto | Una oferta renovada: $428.250, con stock y prueba exacta. |
| MaxTecno, piloto | Ryzen 7 8700G: $484.957 según el lector, con stock y prueba exacta. |

Se habilitó una prueba SSD estricta que exige marca, modelo, capacidad, interfaz, formato y título normalizado completo idénticos. Conserva generación, Plus, sufijos, disipador y condición. Rechaza packs, unidades múltiples, accesorios y contradicciones. No se cambió el detector de conflictos para convertir omisiones en equivalencias. La revisión independiente encontró un caso de cantidad explícita y verificó su corrección, incluyendo el falso positivo MX500 y los carriles PCIe x4.

37Bytes exige precio principal visible consistente con metadata y una variante seleccionada o única que pruebe stock. Una recomendación, metadata sola o un botón Comprar no bastan. La captura de exploración no renovó ofertas; el consumidor obtuvo otra ficha después de reclamar la oferta.

Los cuatro ciclos posteriores a la activación intentaron doce ofertas: tres observadas y nueve fallidas. Las nueve conservan exactamente su fila de precio anterior. Dinobyte produjo conflicto de identidad o ausencia de observación; Mexx fue bloqueado; MaxTecno, GoldenTech y GamersPoint conservaron errores HTTP; Compugarden no produjo observación válida. No se saltaron pausas por tienda ni se declaró agotamiento a partir de un fallo.

## Cobertura: capacidad no equivale a catálogo actualizado

Corte de base completa 17:34:36 UTC; frescura de cobertura de tres horas. La búsqueda experimental conserva su contrato actual de elegibilidad de 24 horas: esta medición de tres horas no modifica ese contrato ni acredita el criterio editorial de las guías.

| Familia | Ofertas guardadas | Soportadas por este ciclo | Observadas recientes | Comparables recientes |
|---|---:|---:|---:|---:|
| Procesadores | 5.683 | 2.599 | 258 | 257 |
| GPU | 5.672 | 2.412 | 104 | 103 |
| RAM | 7.160 | 14 | 3 | 0 |
| Almacenamiento | 6.183 | 865 | 48 | 48 |
| Motherboards | 6.447 | 0 | 0 | 0 |
| Fuentes | 3.440 | 0 | 0 | 0 |
| Gabinetes | 3.811 | 0 | 0 | 0 |
| Refrigeración | 3.001 | 0 | 0 | 0 |
| Computadoras | 13.412 | 0 | 0 | 0 |
| Periféricos | 19.018 | 0 | 0 | 0 |
| **Total** | **73.827** | **5.890** | **413** | **408** |

Sólo 51 observaciones y 48 comparables se atribuyen a esta tanda en la base completa; el resto reciente proviene de tandas anteriores. La capacidad sube de 5.345 a 5.890: incorpora 865 SSD y deja diferidas 320 ofertas FullH4rd antes soportadas. Las 67.937 restantes siguen en el denominador: 21.334 por tienda, 35.447 por familia y 11.156 por destino o atributos insuficientes. No se actualizaron todas las ofertas soportadas.

En el piloto, al corte posterior al reinicio de las 17:35:52 UTC: 166 soportadas, 1.200 sin capacidad validada; doce observadas recientes, diez comparables recientes. Tres observaciones y tres comparables pertenecen a esta tanda. RAM tiene cero objetivos con prueba suficiente en la muestra. El registro conserva 42 fallidas y seis bloqueadas. La nueva captura privada CompraGamer contiene 1.747 registros y 1.703 publicaciones mapeadas: su ausencia no demuestra agotamiento y no equivale a ofertas renovadas.

## Consumo y verificación

Los recibos de los cuatro ciclos confirmaron **107 escrituras D1** y 116 lecturas de estado/sincronización. Nueve consultas remotas y dos controles auxiliares, más el control inicial, elevan el mínimo directo registrado de esta tanda a **6.729 lecturas D1**. La consulta NV3 sin filtro de tienda leyó 107 filas al fallar la caché y una fila en cada hit. La consulta RTX 5060 leyó 2.567; Ryzen 8700G con filtro MaxTecno, 2.164. No extrapolar el costo del hit a todas las búsquedas.

Las fuentes registran 26 solicitudes HTTP: seis para renovar SSD, tres RAM, tres de staging diagnóstico, una exploración 37Bytes y trece en los cuatro ciclos. Un primer intento de staging terminó con error genérico sin métricas: puede agregar de cero a tres solicitudes; no se presenta como costo cero. La etapa diagnóstica siguiente sí concluyó y no renovó precios por sí sola.

Analytics de las 17:36:07 UTC informó **338.076 filas leídas, 23.715 escritas, 272 solicitudes Worker y cero errores** acumulados del día. Frente al corte inicial sólo incorporó 82 lecturas y 79 escrituras; los recibos posteriores demuestran consumo aún no incorporado. CPU p50 1,211 ms y p99 9,257 ms. La demora de Analytics impide atribuir su diferencia como consumo total de la tanda.

La cuota gratuita D1 es de cinco millones de filas leídas y cien mil escritas por día, compartidas por cuenta. [Cuotas D1](https://developers.cloudflare.com/d1/platform/pricing/). El CPU gratuito admite diez milisegundos por invocación; p99 tiene poco margen. [Límites Workers](https://developers.cloudflare.com/workers/platform/limits/). El ensayo cabe en las cuotas observadas; no prueba capacidad para el catálogo completo ni tráfico de producción.

Verificación: 164/164 pruebas Vitest de identidad SSD, pruebas de atributos, detalle y WooCommerce; 66/66 Node del consumidor, ciclo automático, transporte, lectura compartida, presupuesto y rotación. TypeScript sin errores; ESLint sin errores y una advertencia preexistente. Integridad SQLite correcta, sin errores de claves foráneas. Once consultas válidas en diez familias coinciden con el cálculo local original; nueve consultas remotas coinciden con SQLite. El marcador remoto coincide después del último ciclo.

La página pública conserva despliegue `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, fecha `2026-10-10T22:55:51.363775Z` y etag idénticos al corte inicial.

## Automatización, reversión y límites pendientes

Se restauró el LaunchAgent original: cada quince minutos hasta el **12/10/2026 a las 15:03:10 UTC, 12:03 en Argentina**. El primer ciclo tras reactivarlo terminó correctamente y sincronizó MaxTecno. Acumulado del ensayo: 54 intentos, 59 solicitudes a tiendas, 404 escrituras remotas y reserva conservadora de 4.000 escrituras; conserva límites diarios 200/400/20.000. Las pruebas de la base completa son separadas y no tienen un barrido automático de todas las ofertas.

Artefactos privados en `outputs/tercera-recuperacion-2026-10-11/`: recibos SSD/RAM, staging diagnóstico, activación, cuatro ticks, cobertura/paridad e instantáneas antes/después. Producción y Analytics en `outputs/ciclo-automatico-mac-2026-10-11/tercera-*.json`. No versionar bases, HTML privado ni credenciales.

Para revertir este comportamiento, detener el scheduler, restaurar el bundle `consumer-before.mjs` y revertir los cambios SSD/37Bytes de este commit. Mantener FullH4rd diferido conforme a la instrucción del usuario. Revertir código no deshace observaciones: cualquier restauración SQLite requiere reconciliar el marcador remoto mediante el transporte validado, nunca SQL parcial sobre fechas. La siguiente prioridad sigue siendo RAM: sólo catorce ofertas tienen atributos suficientes en la base completa; corregir destinos y obtener kit, velocidad y latencia explícitos antes de ampliar ese soporte.
