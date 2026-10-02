# Contratos de publicaciones

Una publicación se identifica por tienda, ID de origen y URL validada. Su SKU de tienda no es un MPN ni prueba equivalencia entre fabricantes. `source-contracts` centraliza hosts y permisos de las lecturas compartidas; el registro y las 11 tiendas WooCommerce tienen pruebas de paridad.

`inspect-sources` consulta una publicación pública por API WooCommerce y separa legibilidad de autorización para usar precios. `verify-listings` recibe hasta 24 pares explícitos tienda/ID, contrasta API y ficha visible y guarda un diagnóstico local. Ninguno modifica base, cola, identidades o precios. No usar un error HTTP como prueba de API inexistente. Los lectores de detalle toman el ID principal y rechazan contradicciones o recomendaciones.

Las URLs de sesión, categorías, API/admin, credenciales y hosts ajenos se rechazan. Se eliminan sólo parámetros de seguimiento; los de variante se conservan. Un permalink nuevo con el mismo ID se propone para revisión, nunca fusiona productos por similitud de título.

Validación: tests `listing-reference`, `source-discovery`, `scraper-registry`, `woocommerce-shared`; muestra pública 9/11 APIs legibles y cuatro fichas RAM observadas. Fuente/fecha y límites en el informe del 02/10/2026. Rollback: restaurar contratos/lectores/CLI de esta unidad; no borrar los IDs ya observados ni modificar la muestra G02.
