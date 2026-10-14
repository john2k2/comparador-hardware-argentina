# RAM integrada y demora inicial medida en el piloto privado

Corte del 11/10/2026. Cuatro ofertas RAM autorizadas quedaron actualizadas en la Mac y admitidas en Cloudflare: tres publicaciones, con una copia duplicada. La misma muestra previa mostró menor latencia media inicial y menos lecturas D1. Hay variación de red y picos mayores: la demora no está resuelta por completo. No hubo pago, push, escritura Supabase ni cambio del despliegue público.

## RAM observada y buscable

Lectura real CompraGamer del 11/10 a las 23:04:21.445 UTC (20:04 Argentina). Tres solicitudes HTTP compartidas, aproximadamente 2,596 MB. Precio especial informado por la tienda; no se extrapolan otros medios de pago.

| Modelo / SKU | Variante | Precio ARS | Stock | Registros |
|---|---|---:|---|---:|
| Vengeance RGB RS / CMG16GX4M1E3200C16 | DDR4 16 GB, 1×16, UDIMM, 3200, CL16 | 283.600 | in-stock | 2 |
| Vengeance LPX / CMK8GX4M1E3200C16 | DDR4 8 GB, 1×8, UDIMM, 3200, CL16 | 129.990 | in-stock | 1 |
| Vengeance / CMK16GX5M1B5600C40 | DDR5 16 GB, 1×16, UDIMM, 5600, CL40 | 428.000 | in-stock | 1 |

Precio, stock, observación y prueba nueva se guardaron por oferta. Los nombres/specs/claves de producto originales permanecen idénticos. La metadata de búsqueda privada completa los atributos demostrados por fabricante; no cambia los nombres globales ni convierte single-module en kit. Cuatro registros no son cuatro ofertas comerciales distintas. La ficha agrupada gana la deduplicación de la publicación 15558.

Diez comprobaciones Mac/Cloudflare pasaron: tres búsquedas positivas y dos negativas, cada una repetida. Pedir DDR5 32 GB 2×16 a 6000 o DDR4 16 GB 2×8 no devuelve estos módulos. Además, una lectura D1 directa confirmó las cuatro filas byte por byte (8 lecturas, cero escrituras). La interfaz privada mostró precio, stock y fuente de la DDR5; fecha explícita en hora de Argentina y 24 horas.

## Cambio del piloto y costo medido

Worker privado `catalog-search-free-pilot-20261011`, versión `1d02d1fe-4d89-4a77-9061-d93c2c7e7554`: 112,11 KiB, gzip 29,83 KiB, startup 1 ms. Dominio público sin rutas añadidas. La operación de admisión respondió HTTP 200/atomic, con 3.478 lecturas y 95 escrituras D1. La muestra pasó de 1.012/1.366 a 1.016/1.370 productos/ofertas y preservó los 1.366 registros anteriores.

El consumidor actualizado quedó activo en la Mac. Después de reiniciar el scheduler, el tick de las 23:22:51 UTC terminó correctamente: una oferta Katech observada/comparable y dos fallos sin renovar fechas; cuatro HTTP, 24 lecturas y 19 escrituras D1, una sincronización. Salida cero y cada 900 segundos. Muestra y checkpoint conservaron el mismo marcador remoto confirmado. Las cuatro RAM figuran soportadas y programadas; su fecha nueva aún no exigía releerlas.

El ciclo conserva ventana de ensayo hasta **12/10/2026 15:03:10.335 UTC (12:03 Argentina)**, con 200 intentos/400 HTTP/20.000 escrituras remotas por día. El ledger del ciclo a las 23:23 UTC registra 81 intentos, 88 HTTP, 853 escrituras y una reserva conservadora de 4.000 aún vigente. Esa reserva no cuenta como escrituras efectivamente realizadas ni se libera sin recibo.

Analítica Cloudflare del día, corte 23:24:19 UTC: 958.582 filas leídas, 24.192 escritas, 601 solicitudes del Worker y cero errores; CPU p50 1,344 ms/p99 9,011 ms. Es el acumulado del ensayo, incluidas cargas y pruebas anteriores, con retraso de analítica. No equivale al costo de esta tanda ni demuestra que 59.692 productos funcionen gratis en producción.

## Comparación de búsqueda inicial

Antes de admitir RAM se midieron los mismos 1.012 productos/1.366 ofertas: 48/48 respuestas idénticas antes y otras 48/48 después, 16 MISS/32 HIT en cada corte. La hidratación final pasó de cuatro consultas seriales a una. MISS usa 3–4 consultas, antes 6–7; HIT usa una consulta/una fila.

| Medida | Antes | Después |
|---|---:|---:|
| Filas D1, 48 solicitudes | 72.173 | 58.192 |
| Media inicial MISS | 1.100,48 ms | 875,18 ms |
| Peor MISS | 1.433,47 ms | 2.061,18 ms |
| Media de las 48 respuestas | 486,89 ms | 669,98 ms |

19,4% menos lecturas y 20,5% menor media inicial en este corte. El peor caso y la media global empeoraron; no se atribuye toda la variación al motor. Una prueba visual posterior registró 9.596 ms. Una comprobación Node falló al conectar a Cloudflare (`UND_ERR_CONNECT_TIMEOUT`, sin respuesta HTTP); no se atribuye ese fallo a D1. En la repetición directa/puente, MISS directo 820,73 ms (Worker 648 ms/D1 SQL 5,51 ms), HIT directos/puente 144,78–307,53 ms; una lectura independiente con curl dio 259,99 ms/HIT. No hay traza suficiente para asignar retroactivamente el pico visual a una causa única. El puente ahora registra tiempo remoto, cola local, Server-Timing y código de transporte sin guardar credenciales. La primera prueba instrumentada visual dio 3.691 ms: 3.678,48 ms hasta recibir el cuerpo remoto, sólo 3,06 ms de cola local, Worker 717 ms y SQL D1 6,59 ms. La mayor parte de ese pico quedó fuera del tiempo declarado por el Worker; esa traza descarta la escritura de cola local como causa principal de ese caso, sin probar la causa de transporte. Sigue pendiente reducir los picos y demostrar estabilidad con más tráfico dentro del límite del ensayo. Los tiempos locales completos mejoraron, pero no sustituyen medición remota.

## Cobertura y límites de cierre

La base completa local conserva 59.692 productos/73.827 ofertas: sólo estas cuatro RAM se actualizaron en esta tanda explícita. En la muestra a las 23:23 UTC, 170/1.370 ofertas son soportadas, 25 tienen observación durante el ensayo y 18 son comparables dentro de la ventana general de 24 h. Hay 1.200 no soportadas; frescura heredada no se cuenta como nueva observación. La demanda de estas RAM conserva tres horas/renovación anticipada de 90 minutos; búsqueda y comparación general del piloto siguen su corte certificado de hasta 24 h.

Pruebas: 170/170 Vitest de calidad, 41/41 Node de consumidores, 10/10 del verifier remoto, 9/9 de admisión; regresión final conjunta de ciclo/rotación/motor/caché/admisión 63/63. Paridad local completa/muestra 108 JSON y revisión independiente 240 casos, sin hallazgos abiertos. TypeScript, ESLint focal y diff check sin errores. No fue necesario compilar Next.js porque esta unidad no cambia rutas/componentes Next.

Reversión por unidad: calidad y consumidores en [FUENTES_RAM_FABRICANTE_2026-10-11.md](FUENTES_RAM_FABRICANTE_2026-10-11.md); búsqueda en [ENGINE.md](../../scripts/pilots/cloudflare-catalog/ENGINE.md); admisión/datos en [RAM_ADMISSION.md](../../scripts/pilots/cloudflare-catalog/RAM_ADMISSION.md). Las copias SQLite previas, bundle previo, outbox confirmado y recibos están en `outputs/ram-integracion-frio-2026-10-11/`, privados y sin versionar. Retirar código no retira datos admitidos.

Producción conserva deployment `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977` al 100%, modified `2026-10-10T22:55:51.363775Z` y etag idénticos entre inicio y cierre. La versión privada y el contrato de SKU aún requieren integración específica antes de considerar publicación.

## Unidades locales revisables

Commits locales, sin push: `155c7c2` (prueba fabricante), `2965991` (consumidores y ciclo), `e2c60aa` (búsqueda D1) y `6c26d7b` (admisión y puente). Cada unidad conserva tests/docs y tiene menos de 400 líneas cambiadas. Este informe cierra la evidencia, no autoriza publicación ni ampliación del piloto.
