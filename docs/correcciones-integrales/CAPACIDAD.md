# Capacidad y continuidad: cierre local del 14/10/2026

La modificación reduce trabajo innecesario y añade límites comprobables. No acredita todavía capacidad concurrente, cuotas remotas ni disponibilidad continua del equipo que sirve el catálogo.

| Medida | Evidencia local | Límite de interpretación |
| --- | --- | --- |
| Catálogo ensayado | 59.692 productos, 73.827 ofertas y 34 tiendas; origen SQLite de 485.167.104 bytes | Conteos del corte, no ofertas actuales comprables |
| Preparación completa | Tres ciclos válidos de unos 20–22 s, incluidos lectura pública, reconstrucción y certificación | En esta Mac; no CPU de Workers ni rendimiento con varios trabajos simultáneos |
| Puente de precios | Hasta cinco GET, 1.000 filas y 4 MiB por página; timeout de 15 s por lectura | El barrido se continuó hasta cerrar dos ventanas en diez lotes. No garantiza inserciones con retraso mayor al solapamiento de tres horas |
| Portada | Primera lectura tras arranque: 81 ms; diez posteriores: mediana 17 ms, máximo 42 ms | Peticiones secuenciales locales. El corte anterior costaba 2.645 ms |
| API alternativa de portada | Diez lecturas: mediana 15 ms, máximo 21 ms | Misma generación y equipo |
| Fichas y sitemap | Nueve fichas: 3–26 ms; índice 105 ms y página de 1.000 URLs 112 ms | Muestra individual, sin red pública |
| Rate limit distribuido | Deadline total de 3 s; aborta operaciones Redis/Supabase y evita espera indefinida | Lua validado por contrato/mocks del cliente; no se instaló un Redis real para este ensayo |
| Caché y métricas | Tareas ligadas al fin de la respuesta con `after`; timeout de 5 s en escrituras Supabase; espera explícita fuera de Next | Pruebas de fallos y runtime local; no demuestra persistencia real después de una respuesta remota |
| Retención | SQL aislado valida lote acotado, idempotencia, protección de filas vigentes/renovadas/telemetría/demanda y permisos | No borra datos productivos ni demuestra espacio físicamente recuperado |
| Continuidad | Reinicio del servidor local sobre el mismo archivo inmutable; misma generación/fingerprint, portada 200, acceso directo sin token 401 | Reinicio de proceso, no recuperación ante pérdida del disco, túnel o Mac |
| Empaquetado | Worker Next: 5.571,88 KiB gzip; proxy Mac: 2,80 KiB gzip; ambos dry-run aprobados | El dry-run no verifica admisión por plan, CPU, RAM, conectividad ni secretos remotos |

La base remota pesaba 1.029.270.675 bytes en la auditoría, incluyendo índices y TOAST. Esa cifra es histórica y no equivale a la métrica facturable. No se cambió un plan, ejecutó una limpieza remota ni movieron tablas para presentar una reducción ficticia.

**Orden para la etapa pública, todavía no ejecutada**

1. Preparar una generación vigente y conciliar explícitamente las cinco ternas originales y los destinos prioritarios. Conservar la anterior para volver atrás.
2. Publicar sólo después de autorizarlo; acreditar portada, ficha, condición de pago, stock y tienda con la misma observación. No rejuvenecer precios al certificar la copia.
3. Observar ciclos naturales: tiempos, filas transferidas, ofertas admitidas/rechazadas, cursor y fechas realmente servidas. Si un ciclo crece, acotar el universo antes de ampliar tiendas.
4. Medir latencia y fallos públicos y comprobar que el almacenamiento compartido termina su trabajo. Sólo entonces fijar objetivos de servicio con datos observados.
5. Verificar respaldo y recuperación fuera de esta Mac antes de prometer continuidad. Dormir, apagar o perder conectividad sigue afectando al origen actual.
6. Recuperar GA4 y medir compradores externos usando el seguimiento existente. Registrar también gasto y horas; $0 de ingresos y al menos 60 h por 30 días siguen siendo el punto de partida declarado por Jonathan.

No se creó otra automatización. D02, D03 y G02 conservan sus estados y denominadores; las pruebas locales no cuentan como retorno de usuarios ni ciclos productivos útiles.

Actualización de este mismo día: el barrido terminó al corte 04:03 UTC y la candidata de guía tiene 59.693 productos, 73.827 ofertas y 34 tiendas. Su observación de siete publicaciones necesitó tres GET, sin escritura remota. Es trabajo medido en local; no amplía las conclusiones sobre capacidad pública, concurrencia o continuidad. Detalle en [SINCRONIZACION.md](SINCRONIZACION.md) y [GUIA_3M.md](GUIA_3M.md).
