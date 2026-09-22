# Validación del corte 12/09/2026

Se conservó el árbol local existente. La unidad de implementación se publicó y se validó por rutas públicas; las herramientas de tests pueden regenerar carpetas ignoradas de build y resultados.

| Comprobación | Resultado | Límite |
|---|---|---|
| Unitarios focalizados de esta unidad | 8 archivos; 54 aprobados | Cubren catálogo, disponibilidad, sitemap, métricas y estado de categoría; no comprueban producción |
| Lint | Aprobado | Análisis estático |
| TypeScript y diff | Aprobados | Sin errores estáticos ni espacios inválidos en el diff |
| Build Next | Aprobado tras los cambios | Configuración local Redis inválida e historial Supabase con Invalid API key; funciona con degradación |
| Revisión visual y pública | Contacto, disclosure y navegación de información visibles; dos enlaces de correo publicados | Falta comprobar recepción real del correo comercial |
| E2E focalizado anterior | 18 ejecutados; 13 aprobados; 5 fallidos; 2,1 min | Home, navegación de búsqueda y móvil; sin scraping real |
| Dependencias | Cuatro entradas: tres altas y una moderada | Relaciones transitivas; exposición por evaluar |
| Producción | Portada, categorías, búsqueda, ficha y sitemaps con 200 en muestras posteriores | Muestra puntual, no porcentaje de disponibilidad |
| OpenNext desplegable | Aprobado y publicado | La configuración local de Redis sigue degradada durante el build |

## Cinco E2E fallidos

1. `e2e/home-page.spec.ts:60`: selector Procesadores coincide con tres enlaces; además espera URL antigua `/search?category=procesadores`. Los enlaces observados apuntan a `/comparar/procesadores`. Corregir alcance del selector y contrato de ruta.
2. `e2e/home-page.spec.ts:89`: busca enlace COMO FUNCIONA que no está presente. Decidir si volver a hacer visible esa entrada o comprobar Acerca desde el lugar donde existe; no quitar la cobertura de información/confianza.
3. `e2e/home-page.spec.ts:97`: la declaración de independencia existe dos veces y el selector no es único. No significa ausencia del disclosure.
4. `e2e/mobile-responsive.spec.ts:28`: cuenta enlaces con `category=`, pero las categorías usan rutas limpias. Actualizar contrato sin volver a introducir URLs antiguas.
5. `e2e/mobile-responsive.spec.ts:54`: busca heading FILTROS; el snapshot tiene texto genérico FILTROS. Revisar semántica/accesibilidad y comprobar realmente que los filtros se pueden abrir y usar.

Los cinco contratos se actualizaron en el árbol local: rutas limpias de categorías, alcance de selector, enlace visible a Acerca, disclosure no ambiguo y encabezado semántico de filtros. Falta una ejecución E2E completa con resultado persistido para cerrarlos. Los resultados no prueban cinco fallos de navegación reales, ni permiten declarar la UI completa aprobada.

## Inicio de implementación local

- El scheduler diario deja de ejecutar el barrido `full`: ejecuta `hot` con hasta ocho objetivos stale/prioritarios. Si no puede consultar objetivos tracked/hot, ahora termina sin iniciar categorías completas.
- El refresh lanzado desde una visita pública queda opt-in mediante `ENABLE_INTERNAL_BACKGROUND_REFRESH=1`. El cron autenticado y las ejecuciones manuales siguen disponibles.
- Pageviews GA4 se emiten tras cargar GA4 y en cada cambio de ruta; el contacto comercial registra solo intención, tipo y canal, nunca el correo del visitante.
- Se creó la cuenta, propiedad y flujo web de GA4 para `www.comparador-hardware.com.ar`. La medición mejorada quedó activa; su identificador público se incorporó al build y a la configuración del Worker sin registrar valores sensibles en este documento.
- La tanda de accesibilidad y rendimiento de la auditoría Impeccable quedó publicada: contraste AA de CTA oscuro, buscador táctil de 44 px, filtros y menú con estados programáticos, movimiento reducido inmediato y menor costo visual de portada. La evidencia y los límites están en `IMPECCABLE_AUDIT.md`.
- Ofertas agotadas ya no contribuyen a schema de producto, cantidad de tiendas de la ficha ni elegibilidad del sitemap.
- La landing editorial de categoría deja de persistir tras una búsqueda, filtro, orden o paginación en el cliente.
- Contacto explica el piloto patrocinado, independencia del orden orgánico y usa el correo comercial configurado para propuestas y reportes. Falta comprobar su recepción real antes de contar leads.

## Pendiente antes de cierre de esta unidad

1. Confirmar en registros Cloudflare que el cron reducido termina y registrar siete ciclos útiles antes de volver a ampliar alcance.
2. Esperar la recepción inicial de GA4 (Google informa hasta 48 horas) y validar un `page_view`, una navegación y un `generate_lead` de prueba sin datos personales.
3. Probar la recepción del correo comercial antes de contar leads o contactar posibles sponsors.

## Publicación y verificación inicial

- Se publicó la versión `c9b8508d-beff-4428-9430-f895c7d21054` y el despliegue inicial confirmó que el error no estaba resuelto: `/comparar/procesadores` devolvió 503/1102. El log de Cloudflare registró `exceededCpu` y el límite de 10 ms.
- La causa encontrada fue el render inicial: leía y transformaba hasta 1.000 productos para mostrar 12. Se sustituyó la landing de categoría por una lectura paginada de 12 productos agrupados y un conteo de base de datos.
- Se publicó la corrección como versión `2df0aa89-65c5-4885-ae63-6d4bbbc1d81e`. Una solicitud sin cache a CPU respondió 200 en 2.564 ms, GPU en 413 ms, búsqueda Ryzen 5 5600 en 952 ms y portada en 755 ms, sin 1102.
- La revisión visual pública confirmó la landing CPU, filtros, resultados y paginación. Es una muestra inicial; G01 queda en observación hasta comprobar estabilidad sostenida.
- El refresh manual con ocho objetivos alcanzó 503/1102 después de 1 minuto y 50 segundos. Se reduce el scheduler a un solo objetivo por ejecución mientras se mide el costo y se rediseña la coordinación de scraping fuera del request del Worker.
- Se corrigió la clave pública de Supabase del Worker y el primer ciclo limitado terminó con `source=hot-db`, un objetivo, 200, cero fallos y 12 segundos. La respuesta registró el objetivo `memoria-ram` con cero productos: es una ejecución sana, pero todavía no prueba que la frescura y cobertura sean suficientes.
- El acceso administrativo de Supabase confirmó que el proyecto `argen-prices-db` está activo. Se reemplazó en local y en el Worker la clave secreta de servidor que devolvía `Invalid API key`; la clave pública y la secreta verifican ahora lectura de `products` con 200. Una ejecución manual posterior (`34702137652`) terminó en 15 segundos con `source=hot-db`, un objetivo, 200 y cero fallos. Aún debe verificarse que los siguientes ciclos persistan precios útiles.
- La medición directa mostró 46.614 productos, 60.959 precios, 1.814 productos `hot` vencidos y ningún precio actualizado en siete días. Un refresh dentro del Worker para `Ryzen 5 5600` agotó sus dos ventanas de 90 segundos y falló con 504. Se trasladó el scraping diario a un runtime local de GitHub Actions con secretos del repositorio; la misma búsqueda terminó allí en 28 segundos, devolvió dos productos y dejó 18 precios actualizados en Supabase (`34705289877`). El ciclo diario rota 12 consultas de intención de compra en vez de insistir sobre títulos discontinuados.
- El sitemap dejó de cargar el catálogo completo antes de paginar. Dos funciones de Supabase ahora resuelven elegibilidad, deduplicación canónica, conteo y páginas; se mantienen los criterios de dos comercios disponibles y orden estable. La versión pública `88882e9a-3a06-430b-85db-00fdfc44a057` respondió el índice en 2.466 ms con seis sitemaps, la primera página con 1.000 URLs y la última con 794, sin 1102. El tamaño de página se fijó en 1.000 por el límite de respuestas de Supabase.
- Se creó y configuró la propiedad GA4 autorizada para el sitio. La versión pública `7d20dfa4-fe32-40e2-a824-36fe93093ee3` devuelve 200 e incluye el cargador de Google y el identificador de medición esperado; la política CSP permite los dominios de Google Analytics. La confirmación de eventos en informes queda pendiente de la ventana de recepción indicada por Google.
- El muestreo previo sin cache registró portada 200 en 3.350 ms, CPU 200 en 2.306 ms, búsqueda Ryzen 5 5600 200 en 2.127 ms y contacto 200 en 176 ms, todos sin 1102. El índice anterior tardó 13.712 ms; la medición posterior a la optimización se registra arriba.

## Próxima prueba de aceptación

Después del arreglo de infraestructura: abrir portada, CPU, GPU y ficha desde desktop/móvil; buscar una consulta conocida y otra sin resultados; cambiar filtro y orden; verificar oferta/stock/fecha y destino; validar contacto y eventos sin enviar mensajes a negocios. Ejecutar matriz de tiendas y pruebas de roles en entorno apropiado antes de afirmar revisión integral cerrada.

## Seguimiento 13/09/2026

Muestra pública espaciada: portada, CPU, GPU y una ficha agrupada conocida devolvieron 200. El workflow `34751070154` terminó con 200, un objetivo de demanda pública, 11 productos y cero fallos. Confirma recuperación y la ruta de demanda, pero no acredita todavía disponibilidad sostenida, siete ciclos útiles ni frescura agregada por tienda.

## Seguimiento 14/09/2026

La misma muestra pública devolvió 200 en las cuatro rutas. El workflow `34833586162` procesó una demanda pública, devolvió cinco productos y no reportó fallos. Es continuidad sana, sin evidencia suficiente para cerrar la observación de disponibilidad ni de frescura.

## Seguimiento 19/09/2026

Portada, CPU, GPU y ficha conocida devolvieron 200. El scheduler completó siete días consecutivos sin fallos: seis ciclos encontraron entre 2 y 12 productos y el séptimo encontró cero para `rx 6600 xt`. La ausencia de fallos es una mejora sostenida frente al incidente inicial, pero un ciclo verde con cero productos no cuenta como actualización útil; faltan frescura por tienda y evidencia de precios persistidos para cerrar G02.

## Seguimiento 20/09/2026

La muestra pública se mantuvo en 4/4 respuestas 200. La ejecución programada `35503079842` también terminó sin fallos, pero repitió `rx 6600 xt` por segundo día y volvió a devolver cero productos. La salud HTTP continúa estable; la nueva evidencia operativa es que la cola de demanda puede quedar fijada en una consulta vacía. G02 no puede cerrarse hasta comprobar consumo o rotación de ese objetivo y resultados útiles en ciclos posteriores.

## Seguimiento 21/09/2026

La muestra pública continuó en 4/4 respuestas 200. La ejecución `35589635629` rotó a `rx 6950 xt`, descartando por ahora que la cola permanezca fijada en `rx 6600 xt`; aun así, obtuvo cero productos. Son tres ciclos consecutivos sin resultado útil. La estabilidad de ejecución no cambia, pero G02 sigue abierto hasta explicar los ceros y volver a observar precios persistidos.

### Search Console y GA4 — 21/09/2026

Search Console confirmó una ventana completa de 28 días contra los 28 anteriores: 296 vs 192 clics, 14 mil vs 9,55 mil impresiones, CTR 2,1 % vs 2,0 % y posición media 8,4 vs 8,5. La interfaz también mostró 3.187 páginas indexadas, 326 no indexadas y primeros resultados enriquecidos válidos: dos fragmentos de producto, una ficha de comerciante y dos breadcrumbs.

GA4 quedó verificado después de guardar todas las comunicaciones opcionales desmarcadas: 143 usuarios activos, 512 eventos y 178 `page_view` para 24/08–20/09. Search Console no está asociado a GA4; esto limita la integración entre informes, pero no invalida los datos comprobados en GA4.

Jev se usó como segunda opinión con contexto mínimo. Priorizó CPU con 91 % y confianza 0,87, y dio 14 % a cambiar snippets de inmediato. La preparación comercial obtuvo confianza 0,09, por lo que ese juicio no se utiliza. No autorizó ni produjo cambios externos.

### GA4, avisos GSC y recuperación de guías — 21/09/2026

GA4 quedó accesible tras guardar todas las comunicaciones opcionales desmarcadas. Para 24/08–20/09 muestra 143 usuarios activos, 512 eventos, 178 `page_view`, 18 `click`, 7 `form_start`, 19 `user_engagement` y 4 `scroll`. No aparece `generate_lead`. G03 queda comprobado; G07 sigue abierto porque falta distinguir clics de tienda y conservar sus dimensiones.

El mensaje de Search Console del 16/09 identificó un `Error de servidor (5xx)` para `/guia/pc-gamer-2-millones`, con primer registro el 15/09 y rastreo del 18/09. La prueba del 21/09 reprodujo 503/1102 en las tres guías de presupuesto. El código cargaba hasta 8.400 filas de catálogo durante cada render.

El commit `158a580` acotó la lectura a 24 productos agrupados y comprables por cada una de siete categorías. Verificación previa: 16 pruebas unitarias, lint focalizado, build completo y tres guías locales en 200. La versión pública `921e0f4b-1d01-4493-82b4-fa2c5359bc7b` dejó las tres guías en 200; CPU continuó en 200. Search Console confirmó `Resultado de la validación: iniciada` el 21/09 para `/guia/pc-gamer-2-millones`. La incidencia sigue abierta hasta que Google vuelva a rastrear y comunique el resultado final.

### Auditoría completa de Search Console — 21/09/2026

La prueba en tiempo real de `/guia/pc-gamer-2-millones` mostró que la URL está disponible para Google y se puede indexar. El índice aún conserva el rastreo del 20/09 con 5xx, por lo que G01 sigue en observación y la validación permanece iniciada.

Sitemap: correcto, 29 páginas descubiertas, última lectura 15/09. HTTPS: 31 válidas y cero no HTTPS. Retiradas: ninguna solicitud en las tres categorías durante seis meses. Seguridad: sin acciones manuales ni problemas detectados. Core Web Vitals: sin datos CrUX suficientes en móvil y escritorio.

Resultados enriquecidos: dos fragmentos de producto, una ficha de comerciante y dos breadcrumbs válidos. Quedan mejoras opcionales de reseñas y campos Merchant de envío, devoluciones y SKU; no se completarán con datos inventados. Google detecta 662 oportunidades de producto, que no equivalen a ventas ni audiencia.

Rastreo: aproximadamente 16 mil solicitudes en 90 días, 97 % con 200 y 373 ms de respuesta media. El host conserva la señal histórica de conectividad elevada de la semana anterior. `robots.txt` fue obtenido y su única advertencia era la directiva `Host` ignorada en la línea 13. El commit `d75a981` la eliminó; prueba, lint y build pasaron, y la versión Cloudflare `c00c30a7-e659-46f1-93f0-80b528a8da89` devolvió el archivo público en 200 sin esa directiva.

Enlaces: dos externos y 7.751 internos, concentrados en URLs legacy de categorías y páginas institucionales. Asociación: Search Console no está vinculado con GA4. IA generativa: control heredado en `Incluir`. Estos hallazgos abren G17 y no cierran G01, G02 ni G07.

### Registro de decisión Jev — 21/09/2026

Opciones evaluadas: instrumentación del embudo y CTA; enlaces internos/rich results; asociación GA4–Search Console; Merchant Center; preparación o contacto con sponsors. Resultado principal: embudo/CTA 64 %, confianza 0,56. Segunda prioridad: enlaces/rich results 39 % frente a asociación GA4 32 %, confianza 0,23. Activar Merchant ahora: 6 % a favor. Contactar sponsors ahora: 26 % a favor. Confianza global: 1,52/4, entre baja y media.

Contraste: la recomendación principal coincide con la ausencia de dimensiones por tienda y `generate_lead`. La segunda prioridad queda compartida entre G17 y la asociación GA4 porque la diferencia y la confianza son bajas. Jev es asesoría y no autoriza activaciones externas, mensajes comerciales ni cierres de tareas.

### Corte de implementación G07 — 21/09/2026

El código ya emite `generate_pc_budget`, `select_advisory_cta`, `generate_lead` y `outbound_store_click` en el recorrido de armador, guías, fichas, contacto y salidas de las guías. Los eventos se probaron mediante tests unitarios y el recorrido se verificó localmente en `/guia/armar?pesos=1500000` y `/contacto#asesoria-pc`. `npm run lint` y `npm run build` finalizaron sin errores.

Estado de evidencia: implementación publicada en Cloudflare como versión `b9375fe3-3403-4c18-8edb-21edff29fbb5`. `/contacto` y `/guia/armar?pesos=1500000` respondieron 200 y mostraron el CTA en el HTML público. La aparición de eventos en GA4 todavía no está verificada. Un clic de correo representa intención de contacto, no confirma que el mensaje haya sido enviado ni recibido. No se registran datos personales en los parámetros nuevos.

### Corte operativo — 22/09/2026

Las cuatro rutas diarias respondieron 200. El scheduler `35712677571` devolvió `fallbackApplied=true`: `rx 6950 xt` produjo cero artículos y la consulta de recuperación `ryzen 5600` obtuvo dos. La ejecución manual fallida `35678031730` fue una prueba acotada a Mexx, Venex y Maximus; las dos ejecuciones manuales posteriores por categoría fueron exitosas. La recuperación está comprobada, pero no cierra G02 ni prueba frescura completa del catálogo.
