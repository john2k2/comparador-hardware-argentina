# Validación del corte 12/09/2026

Se conservó el árbol local existente. La unidad de implementación se publicó y se validó por rutas públicas; las herramientas de tests pueden regenerar carpetas ignoradas de build y resultados.

| Comprobación | Resultado | Límite |
|---|---|---|
| Unitarios focalizados de esta unidad | 8 archivos; 54 aprobados | Cubren catálogo, disponibilidad, sitemap, métricas y estado de categoría; no comprueban producción |
| Lint | Aprobado | Análisis estático |
| TypeScript y diff | Aprobados | Sin errores estáticos ni espacios inválidos en el diff |
| Build Next | Aprobado tras los cambios | Configuración local Redis inválida e historial Supabase con Invalid API key; funciona con degradación |
| Revisión visual local | Contacto, disclosure y navegación de información visibles | El correo no está configurado localmente, por lo que el CTA comercial queda correctamente en estado pendiente |
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
- Ofertas agotadas ya no contribuyen a schema de producto, cantidad de tiendas de la ficha ni elegibilidad del sitemap.
- La landing editorial de categoría deja de persistir tras una búsqueda, filtro, orden o paginación en el cliente.
- Contacto explica el piloto patrocinado, independencia del orden orgánico y usa el correo configurado para propuestas comerciales. Sin correo operativo configurado, no inventa un canal.

## Pendiente antes de cierre de esta unidad

1. Confirmar en registros Cloudflare que el cron reducido termina y registrar siete ciclos útiles antes de volver a ampliar alcance.
2. Esperar la recepción inicial de GA4 (Google informa hasta 48 horas) y validar un `page_view`, una navegación y un `generate_lead` de prueba sin datos personales.
3. Configurar y probar la recepción del correo comercial antes de contar leads o contactar posibles sponsors.

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
