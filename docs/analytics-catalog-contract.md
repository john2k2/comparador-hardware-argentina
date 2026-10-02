# Medición para decisiones de catálogo

`search` se registra cuando la petición queda resuelta y sin error; `view_item` una vez por navegación efectiva. Si el consentimiento se concede después del render, se emite el evento pendiente sin duplicar el de una navegación ya medida. Recargar es una nueva navegación. Rechazo no consume marcas ni solicita Google.

`contact_intent` mide intención de contacto, no recepción real de una consulta. Las comparativas registran tienda/CTA/superficie e ID cuando es conocido. El agregado autorizado por `pagePath` /product/ sigue excluyendo clics desde otras superficies: no inventar atribución.

GA4 limpio comienza el 03/10; primera extracción semanal autorizada el 12/10. Usar siete días completos con desfase y `totalUsers` filtrado por evento, no sumar únicos duplicados. Informe incompleto o muestreado no autoriza importar ceros. El importador valida todos los IDs antes de una única escritura y confirma sus filas; una lectura tardía fallida no deja lotes parcialmente renovados.

Validación: pruebas ga4/consent/import-interest y navegador: búsqueda directa, búsqueda fallida sin evento y ficha tras consentir sin duplicación. Rollback: consumidores/etiquetas anteriores, anotando el corte de comparabilidad en métricas; no reconstruir consultas recibidas a partir de mailto ni renovar señales sin datos.
