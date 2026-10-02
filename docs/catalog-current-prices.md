# Selección de precios actuales

Elegibilidad se calcula antes de elegir por tienda: precio positivo, stock explícito, URL registrada, identidad corroborada y fecha real de oferta <=24 h en catálogo; las guías/armador conservan <=3 h. Una oferta barata histórica no desplaza una alternativa actual de la misma tienda. El payload conserva alternativas e historial.

El agregado SQL valida evidencia al escribir, mantiene un resumen con vencimiento y recalcula al caducar o filtrar tiendas. Cambios de nombre/categoría/host lo invalidan. Cache TTL y timestamp de producto no prolongan una oferta. Filtros de precio exigen una oferta actual; orden prioriza resultados actuales y conserva referencias históricas separadas.

Validación: SQL `current_offer_evidence`, `paginated_catalog`, pruebas de lectura de productos, 35.000 fichas sintéticas y 70.000 ofertas en PostgreSQL local. Consulta global 132 ms, específica 5 ms, global por tienda 3.004 ms; no son p95 de producción. Rollback: volver a la definición anterior de búsqueda mediante migración forward, conservar las columnas/evidencia agregadas y revertir consumidores TS de esta unidad. No alterar ofertas/timestamps.
# Cambio de contrato de caché — 02/10/2026

La búsqueda usa `catalog-v12`, el almacenamiento de búsquedas `search-cache:v5:` y las fichas `product-detail:v4:`. La publicación no reutiliza respuestas de la versión anterior que seleccionaban el mínimo antes de validar alternativas o redondeaban el importe observado. Los plazos de caché no renuevan la fecha de ninguna oferta. La presentación en ARS puede redondearse; el precio interno de la oferta conserva sus centavos.
