# Corroborar el producto principal

El lector compartido vincula URL/canonical y título principal con un único Product y Offer ARS positivo. Corrobora precio y disponibilidad con el DOM principal/variante seleccionada cuando existen esas señales; ausencia de stock conserva desconocido. Excluye relacionados, texto editorial y elementos ocultos. Mantiene centavos.

Product, Offer y variante seleccionada deben coincidir en SKU explícito. Igual precio no permite tomar stock de otro SKU. Una inconsistencia lanza `inconsistent-source`; no se reemplaza por otra señal. La plantilla Maximus sola no produce observación; su fetch conocido enlaza el lector V6 de la unidad 4.

Verificación final conjunta de catálogo: 55/55 en `known-product-detail.test.ts`, `tiendanube-shared.test.ts` y `listing-reference.test.ts`; revisor independiente, 74/74 en lectores/Woo/worker/servicio, cerró el defecto de SKU. Full verify: 1.816 unitarias y 25 operativas; build y dry-run aprobados. No son pruebas de disponibilidad de todo el catálogo.

Runtime: dos cortes públicos limitados a una publicación por tienda; replay offline del DOM conservado de Megasoft/Noxie/Rocket recupera tres lecturas, con fechas originales. Hyper sigue rechazado por canonical distinto. Agregar un precio principal $1 sólo en memoria produjo conflicto en cinco capturas válidas. No renovó fechas ni persistió ofertas.

Reversión: helper, parser/fetch genérico y pruebas, conservando el módulo específico Maximus independiente. Revertir antes la integración dependiente de TiendaNube si aún importa el helper. No retirar reglas de identidad, frescura o elegibilidad.

`size:exception`: la unidad mínima cohesiva supera 400 líneas autorales. Se hizo una separación por comportamientos: Maximus, TiendaNube, consumidores, Woo y caché tienen unidades propias; el helper, su contrato y sus regresiones permanecen juntos. El manifiesto de commits registra el tamaño exacto. No se comprimió código ni se eliminaron comentarios/tests para cumplir un número.
