# Validación del corte 12/09/2026

Se conservó el árbol local existente. Además de los documentos, inició una primera unidad de implementación local; no está publicada todavía. Las herramientas de tests pueden regenerar carpetas ignoradas de build y resultados.

| Comprobación | Resultado | Límite |
|---|---|---|
| Unitarios focalizados de esta unidad | 8 archivos; 54 aprobados | Cubren catálogo, disponibilidad, sitemap, métricas y estado de categoría; no comprueban producción |
| Lint | Aprobado | Análisis estático |
| TypeScript y diff | Aprobados | Sin errores estáticos ni espacios inválidos en el diff |
| Build Next | Aprobado tras los cambios | Configuración local Redis inválida e historial Supabase con Invalid API key; funciona con degradación |
| Revisión visual local | Contacto, disclosure y navegación de información visibles | El correo no está configurado localmente, por lo que el CTA comercial queda correctamente en estado pendiente |
| E2E focalizado anterior | 18 ejecutados; 13 aprobados; 5 fallidos; 2,1 min | Home, navegación de búsqueda y móvil; sin scraping real |
| Dependencias | Cuatro entradas: tres altas y una moderada | Relaciones transitivas; exposición por evaluar |
| Producción | 200 iniciales y posteriores 503/1102 | Muestra puntual, no porcentaje de disponibilidad |
| OpenNext desplegable | No ejecutado | Necesario al corregir infraestructura |

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
- Ofertas agotadas ya no contribuyen a schema de producto, cantidad de tiendas de la ficha ni elegibilidad del sitemap.
- La landing editorial de categoría deja de persistir tras una búsqueda, filtro, orden o paginación en el cliente.
- Contacto explica el piloto patrocinado, independencia del orden orgánico y usa el correo configurado para propuestas comerciales. Sin correo operativo configurado, no inventa un canal.

## Pendiente antes de cierre de esta unidad

1. Publicar esta versión y comprobar que portada, categorías, búsqueda y una ficha dejan de devolver 1102.
2. Confirmar en registros Cloudflare que el cron reducido termina y registrar siete ciclos útiles antes de volver a ampliar alcance.
3. Ver un `page_view`, una navegación y un `generate_lead` de prueba dentro de la propiedad GA4 sin datos personales.
4. Configurar y probar la recepción del correo comercial antes de contar leads o contactar posibles sponsors.

## Próxima prueba de aceptación

Después del arreglo de infraestructura: abrir portada, CPU, GPU y ficha desde desktop/móvil; buscar una consulta conocida y otra sin resultados; cambiar filtro y orden; verificar oferta/stock/fecha y destino; validar contacto y eventos sin enviar mensajes a negocios. Ejecutar matriz de tiendas y pruebas de roles en entorno apropiado antes de afirmar revisión integral cerrada.
