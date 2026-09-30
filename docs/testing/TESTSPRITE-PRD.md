# Requisitos de prueba — Comparador Hardware Argentina

Este documento es la entrada para TestSprite. Especifica comportamiento esperado;
no representa resultados ejecutados ni acredita precios disponibles en tiendas.

## Entorno y alcance

- Aplicación Next.js, UI en español, uso anónimo inicial.
- URL inicial: http://127.0.0.1:3100, iniciada con `npm run testsprite:serve`.
- Frontend, alcance `codebase`, `needLogin: false`.
- Escritorio 1440 × 900 y móvil 390 × 844.
- Búsqueda y detalle usan datos de prueba. Los precios de fixtures no son ofertas
  reales. Guías, comparativas e índice pueden leer el catálogo público disponible.
- No registrar cuentas, enviar emails, iniciar OAuth, crear alertas ni escribir
  favoritos en Supabase. Los recorridos de sesión válida requieren un entorno
  aislado y una cuenta de prueba, y deben figurar como pendientes hasta disponer de ellos.
- No ejecutar refresh, scraping, cron ni acciones administrativas reales. En el
  armador, comprobar el estado de la interfaz sin despachar actualizaciones reales.
- No subir `.env*`, claves, datos de usuarios, documentos privados ni cortes de sesiones.
- Inspeccionar enlaces a tiendas sin comprar ni enviar formularios externos.

## Casos y criterios de aceptación

| ID | Recorrido | Resultado esperado |
| --- | --- | --- |
| CH01 | Home y navegación | H1, buscador, categorías y footer visibles; enlaces internos abren su destino. |
| CH02 | Búsqueda por nombre | Una búsqueda Ryzen muestra productos correspondientes y preserva `q` en URL. |
| CH03 | Precio mínimo/máximo y tienda | Resultados respetan filtros; filtros quedan en URL y sobreviven atrás/adelante. |
| CH04 | Orden y paginación | Orden ascendente coherente; página 2 cambia resultados y conserva query/filtros. |
| CH05 | Vacío, error y reintento | Vacío real distinto de idle y de error; 503 no se muestra como “sin resultados”; reintento recupera. |
| CH06 | Categorías | Procesadores, GPU, motherboards y RAM muestran H1, intro y controles; slug desconocido devuelve 404. |
| CH07 | Producto | Nombre/modelo correctos, tiendas, precios/estado y fuentes visibles; ID desconocido devuelve 404 real. |
| CH08 | Frescura | Una oferta antigua se identifica como histórica; no se usa como precio actual, total confirmado ni Offer vigente. |
| CH09 | Comparador entre productos | Agregar/quitar productos, comparar y volver conserva selección válida; estado vacío comprensible. |
| CH10 | Guías | Índice, detalle y enlaces funcionales; presupuesto como máximo; siete ofertas elegibles para una PC completa. |
| CH11 | Armador PC | Selección, compatibilidad, subtotal confirmado/referencia; Guardar armado → recargar → Recuperar guardado conserva selección; compartir y descarga funcionales. |
| CH12 | Índice de precios | Página carga; descarga CSV contiene datos y columnas consistentes con su documentación. |
| CH13 | Auth anónima | Formulario y opciones visibles; admin redirige sin sesión; no enviar credenciales reales en esta pasada. |
| CH14 | Móvil y teclado | Menú utilizable, foco visible, labels y skip link; sin desbordamiento horizontal material. |
| CH15 | SEO y páginas legales | Metadata, canonical, robots, sitemap; 404 con noindex; acerca/contacto/privacidad/términos accesibles. |
| CH16 | Hidratación/CSP | No errores JS que impidan buscar, filtrar o interactuar; mantener CSP activa. |

## Pasada pública complementaria, de lectura

La ejecución local no acredita Cloudflare ni el catálogo productivo. Comprobar
por separado el dominio https://www.comparador-hardware.com.ar:

- `/api/search?q=ryzen`
- `/api/search?minPrice=100000&sortBy=price-asc`
- `/api/search?q=rtx&sortBy=price-asc&page=2`
- `/api/search?category=procesadores&sortBy=price-asc`
- Render de home, búsqueda, producto, guía y comparativa en escritorio y móvil.

Registrar status, latencia, tamaño y paginación de cada respuesta. No afirmar
disponibilidad/stock o precios vigentes sin contrastar la publicación de cada tienda.

## Criterio de cierre

Cada requisito debe enlazar un caso ejecutado y su evidencia. Marcar como pendiente
o bloqueado todo recorrido sin datos o credenciales. No aceptar como aprobación
un test que termina sin sus aserciones principales. Para fallos, distinguir defecto
de la página, del test y del entorno; conservar evidencia y repetir el caso tras
la corrección. Ningún porcentaje generado sustituye esta trazabilidad.

## Reglas aprendidas al revisar las ejecuciones

- En comparación dinámica, `CAMBIAR` dentro de Producto B quita su selección y
  elimina la comparación completa. Puede conservar la consulta y sus resultados;
  una tarjeta de resultado no equivale a un producto seleccionado.
- El armador usa guardado y recuperación explícitos. No exigir autoguardado de
  una selección sin pulsar `Guardar armado`.
- El agente frontend de TestSprite no pudo ajustar el viewport ni inspeccionar
  la metadata del documento en esta pasada. Conservar el bloqueo móvil y verificar
  geometría, HTTP 404 y robots con navegador/HTTP complementarios.
