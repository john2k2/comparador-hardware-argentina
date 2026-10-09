# Guías, contenido y preparación para AdSense — 9 de octubre de 2026

Estado: candidata local sobre `c1fd2b6f1f11f8956c7b23134796390981fd38b2`, rama `codex/guias-adsense-preparacion`. La publicación anterior de la auditoría está en producción; este conjunto es posterior y requiere autorización concreta para publicar. No se modificaron cuentas, anuncios, bases remotas ni programaciones durante esta preparación.

## Resultado editorial

Las tres guías recuperaron siete componentes elegibles con las definiciones nuevas, el lector real y el catálogo persistido. Se contrastaron 14 publicaciones únicas de CompraGamer, Mexx y Rocket Hard entre 21:11 y 21:13 UTC. La última inspección de interfaz con datos reales fue entre 21:43 y 21:44 UTC, en 1440 y 390 píxeles.

| Referencia | Total de componentes al corte | Ofertas elegibles | Máximo editorial |
| --- | ---: | ---: | ---: |
| $1.000.000 | $1.021.256 | 7/7 | $1.100.000 |
| $2.000.000 | $2.032.670 | 7/7 | $2.200.000 |
| $3.000.000 | $2.852.459 | 7/7 | $3.300.000 |

Los importes corresponden al medio de pago informado por cada tienda. No son cotizaciones de equipos armados; envío, armado, sistema operativo, periféricos y accesorios adicionales se pagan aparte. Las fuentes de 2M y 3M no incluyen cable de alimentación a 220 V según la publicación. La elegibilidad exige precio positivo, stock informado, identidad/variante correcta y observación real de hasta tres horas; no se renovaron fechas por leer, compilar ni revisar manualmente una tienda. Repetir el corte antes de publicar si venció esa ventana.

- **1M:** Ryzen 5 5500 con Wraith Stealth, Arc A380 Challenger ITX OC 6 GB, Mancer Vant S 16 GB DDR4 CL19 (un módulo), ADATA SU650SS SATA de 512 GB, B550M-HDV, Antec CSK650DC AR y VX310. La FAQ ya no promete estar por debajo del millón. Para Arc se explicitan UEFI, CSM desactivado, Above 4G y ReBAR.
- **2M:** reemplaza un conjunto AM5 que ya excedía el margen aun sin fuente. Usa Ryzen 7 5700 con cooler, RX 9060 XT Challenger OC de 16 GB, 16 GB DDR4, NV3 de 1 TB, B550M-HDV, Steel Legend SL-750G y VX310. El 5700 ofrece ocho núcleos, sin promesa de más FPS; se informa la alternativa 5500, $109.345 menor al corte. La RAM actual es un módulo: no se anuncia dual channel.
- **3M:** Ryzen 5 7600 con Wraith Stealth, RX 9060 XT Challenger OC de 16 GB, Patriot Viper Venom **PVV532G600C36K**, 32 GB en 2×16, DDR5-6000 **CL36**, NV3 de 1 TB, MSI B650M GAMING WIFI, SL-750G y VX310. No se mezcla con CL30 ni con la placa de 8 GB.

Se revisaron dimensiones de GPU/gabinete y fuente, conectores de alimentación, socket, generación de memoria y almacenamiento. B550M-HDV requiere BIOS P2.10 para el 5700; la BIOS de la unidad entregada debe confirmarse con el vendedor. 5500 y 5700 limitan los enlaces a PCIe 3.0. La RAM de 6000 MT/s depende de perfil y estabilidad; no se certifica QVL del kit. Se pide comprobar alimentación de los ventiladores y no se promete sincronización ARGB en la B550M-HDV. No se hicieron pruebas físicas de armado ni benchmarks propios.

Fuentes primarias incorporadas a las páginas: [CPU/BIOS ASRock](https://www.asrock.com/support/cpu.asp?s=AM4&u=693), [B550M-HDV](https://www.asrock.com/MB/AMD/B550M-HDV/index.asp), [MSI B650M GAMING WIFI](https://www.msi.com/Motherboard/B650M-GAMING-WIFI/Specification), [RX 9060 XT exacta](https://www.asrock.com/Graphics-Card/AMD/Radeon%20RX%209060%20XT%20Challenger%2016GB%20OC/), [SL-750G](https://www.asrock.com/Power-Supply/SteelLegend/SL-750G/), [Kingston NV3](https://www.kingston.com/en/memory/search?partid=SNV3S%2F1000G) y [Antec VX310](https://antecplay.com/products/vx-310-argb-gaming-case). El detalle de URLs, SKU, siete precios y observaciones se conserva en `outputs/guias-adsense-2026-10-09/catalogo/README.md` y `contraste-comprable.json`.

Las siete comparativas recibieron correcciones específicas: funciones DLSS frente a Multi Frame Generation, DDR4/DDR5 según la placa y el socket, latencia expresada correctamente, consumo de variantes concretas y retirada de ganadores estáticos de precio/stock. Se corrigió el enlace de Sapphire. Las comparativas conservan las atribuciones de benchmarks preexistentes; no se presentan como mediciones propias ni como una nueva reproducción de todos los resultados de TechPowerUp, cuyo acceso estuvo restringido durante este corte.

Las fechas visibles, Open Graph, Article y sitemap reflejan la revisión del artículo correspondiente. Un build futuro no cambia la fecha editorial. Privacidad enlaza siempre al canal de contacto para solicitudes de derechos, incluso cuando el correo no está disponible al compilar.

## Correcciones de lectura y elegibilidad

Se reprodujeron errores de consulta por tiempo excedido. Antes, una lectura parcial o fallida podía quedar memorizada como si el catálogo estuviera vacío. Ahora se conserva lo que se pudo leer, se informa el fallo y se permite reintentar sin esperar cinco minutos. El planificador recibe un error explícito y la página no presenta una falta de lectura como agotamiento ni habilita el anuncio editorial.

El filtro de guías aprovecha el índice GIN existente de `catalog_document` mediante un término alfanumérico con dígitos, conservando todas las condiciones originales sobre los cinco campos. No crea índices, cambia tablas, aumenta concurrencia ni amplía tiempos límite. La comparación de 14 consultas, alternando el orden, dio resultados completos idénticos en los 14 casos. En esa muestra la mediana pasó de 573 a 192 ms; es una muestra acotada, no una garantía de capacidad o latencia futura. Dos lecturas posteriores del resolver real devolvieron las tres guías 7/7 sin errores.

Los procesadores de las guías exigen evidencia positiva de cooler incluido. Un nombre BOX sin esa evidencia, una presentación desconocida, una negación o una contradicción quedan excluidos. El filtro actúa antes de elegir la mejor oferta de cada tienda, por lo que puede conservar la siguiente publicación válida. Aplica también a referencias y destinos del planificador. No cambia el límite exacto del armador personalizado ni sus reglas de presupuesto.

## Dependencias, cabeceras y herramientas

- Next, su analizador y su configuración ESLint pasan a **16.3.8**; Wrangler a **4.149.0**. Se actualizaron dependencias transitivas afectadas sin usar una corrección forzada ni cambiar de línea mayor.
- El análisis final de dependencias de producción pasa de ocho nodos señalados a **cero**. El análisis completo conserva cinco nodos de una sola cadena afectada por [braces, GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), sin parche publicado. El consumidor examinado procesa patrones de configuración de ESLint; no se encontró una entrada HTTP pública hasta él. No se degrada Next/ESLint a 14 para esconder el aviso. Esto no certifica ausencia de vulnerabilidades del código o del artefacto.
- El Worker y producción enviaban algunas cabeceras fijas duplicadas, como `DENY, DENY` y `nosniff, nosniff`. Se mantienen una sola vez desde `next.config.ts`; el proxy conserva CSP y nonce. La prueba de navegador exige valores únicos y la hidratación correcta.
- Las pruebas de autenticación ahora incluyen configuración pública ficticia en su servidor local, igual que CI. No usan cuentas reales. El catálogo sintético filtra ofertas por tienda antes de calcular precios y aplicar límites, sin modificar el catálogo original.
- El validador público recorre las tres guías y siete comparativas, registra elegibilidad separada de HTTP 200 y contrasta el editor de `ads.txt` con la metadata. Comprueba la política real de robots (sitemaps y rutas privadas), sin exigir un `Disallow: /` inexistente en este proyecto.

## Verificación y límites

La evidencia detallada se guarda localmente bajo `outputs/guias-adsense-2026-10-09/`; no se publican feeds crudos ni datos de la cuenta AdSense.

| Comprobación | Resultado |
| --- | --- |
| Lint y tipos | Aprobados |
| Unitarios | 2.285 aprobados, 2 omitidos |
| Operación y SQL | 199 aprobados, incluyendo PostgreSQL 17 local; sin migraciones remotas |
| Navegador sobre build Next | 68/68 aprobados en la corrida final, 56,5 segundos |
| Next/OpenNext completo | Aprobado después de la última corrección; Worker generado con Next 16.3.8 |
| Worker local | 41/41 controles de rutas y 8/8 contratos: SSR/schema, imágenes PNG/WebP, CSP/nonce, hidratación móvil, sesión y rechazo admin |
| Interfaz con catálogo real | 12/12 recorridos, escritorio y móvil; sin errores JS, desborde horizontal ni violaciones detectadas por axe; guías 7/7 |
| Sitio publicado anterior | 41/41 controles públicos; no acreditan publicación de esta candidata |
| Revisión independiente | Sin defectos materiales pendientes en el alcance revisado; coordinador concilió los recibos finales de navegador y Worker |

Recibos finales: `verificacion-cierre.log`, `navegador-cierre.log`, `opennext-cierre.log`, `worker-rutas-final/public-site.json`, `worker-contratos.json` e `interfaz-cierre/resultados.json`. El documento prefabricado de privacidad y una página 404 se comprobaron también con el hostname público dirigido al Worker **local**: ambos conservaron valores únicos de las cabeceras de seguridad (`worker-host-publico.json`). Los assets de imagen se sirven por su binding separado y su comprobación acredita formato/contenido, no cabeceras de páginas HTML.

Se preservan también los intentos fallidos: seis pruebas de autenticación por configuración pública ausente, intento de empaquetar un build E2E sin el trace standalone y primer corte del Worker. OpenNext necesita su build completo: no reutilizar `--skipNextBuild` con el build corriente de Playwright. La advertencia de OpenNext sobre soporte experimental del middleware Node permanece; las pruebas locales de runtime no la eliminan.

Los artefactos `.next` y `.open-next` generados aquí contienen configuración **QA**. Deben reconstruirse con la configuración productiva tras autorización. La suite controlada no certifica OAuth real, funcionamiento de todas las tiendas, Core Web Vitals de campo ni cobertura permanente del catálogo.

## AdSense observado

Lectura autenticada de 21:10 UTC: sitio en **Preparando**, propiedad verificada y revisión solicitada. No se mostró un motivo de rechazo para este dominio. Anuncios automáticos desactivados; el piloto del código continúa desactivado y sin rutas aprobadas. El mensaje europeo figura publicado, lo cual no acredita por sí solo su ejecución regional.

La cuenta todavía indica `ads.txt: No se encuentra`, con estado fechado el 30 de septiembre. Los GET del dominio raíz y `www` devolvieron 200, `text/plain` y la línea correcta del editor `pub-4559843439616138`. No se alteró el archivo correcto ni se reenvió la revisión. Google explica que [su detección de ads.txt puede demorarse](https://support.google.com/adsense/answer/7679060?hl=en); esa explicación no confirma cuándo se actualizará esta cuenta.

Google evalúa [contenido original, utilidad y navegación](https://support.google.com/adsense/answer/7299563?hl=en-EN). Las correcciones preparan el sitio, pero no equivalen a aprobación ni justifican prometer “100%”. Activar anuncios, ampliar el piloto o cambiar la cuenta quedan fuera de esta candidata.

## Decisión sobre Cloudflare

Recomendación: conservar Workers y Supabase por ahora. El defecto medido se corrigió en las consultas sin migrar la base. Una migración completa no tiene una mejora de rendimiento, costo o aprobación AdSense demostrada para este proyecto.

- [D1](https://developers.cloudflare.com/d1/) utiliza SQLite. Migrar las consultas PostgreSQL, funciones, permisos por fila y la integración de usuarios requiere rediseño y pruebas; no basta con cambiar una URL.
- [Hyperdrive con Supabase](https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/supabase/) permite conservar PostgreSQL. Sería una evaluación acotada de lecturas críticas; el cliente HTTP `supabase-js` actual no obtiene esa mejora por agregar solamente una configuración.
- [R2, KV y otras opciones de almacenamiento](https://developers.cloudflare.com/workers/platform/storage-options/) pueden servir para archivos y cachés según el patrón de acceso. El ahorro debe compararse con costo operativo y consistencia; una caché nunca renueva la fecha de observación de una oferta.

Revisar esta decisión sólo con mediciones representativas de consultas, costo, mantenimiento y recuperación. Prioridad inmediata: publicar la candidata verificada cuando exista autorización y comprobar el resultado en producción.

## Publicación y reversión

Antes de publicar: reconciliar la rama con `main`, confirmar de nuevo siete ofertas elegibles por guía y sus totales, reconstruir sin variables QA y ejecutar CI. No despachar refresh manual ni relajar elegibilidad para cumplir el corte. Si una oferta venció, mostrar el estado real y resolverlo dentro del proceso autorizado.

Después: verificar en el dominio las tres guías, las comparativas modificadas, privacidad/contacto, imágenes, nonce/hidratación, búsqueda y rechazo de acceso administrativo. Mantener los anuncios desactivados. Reversión por commits de este conjunto o versión Worker previa; no hay migraciones SQL que revertir. La observación automática de ofertas y la revisión editorial conservan propósitos separados.

Commits de implementación, en orden:

| Commit | Unidad revisable |
| --- | --- |
| `af398a6` | Errores de lectura de guías y aprovechamiento del índice existente |
| `5f2fc03` | Selecciones, cooler incluido, comparativas, fechas y privacidad |
| `961b7fe` | Parches de dependencias Next/Cloudflare |
| `3e36a9b` | Cabeceras únicas y contratos de verificación local/pública |
