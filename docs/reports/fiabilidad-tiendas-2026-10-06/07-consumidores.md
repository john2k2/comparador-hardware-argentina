# Leer la publicación exacta antes de buscar

El worker solicitado y adaptativo consulta primero la URL conocida, salvo el feed específico de CompraGamer. Ante `inconsistent-source`, bloqueo o rate limit detiene la búsqueda. Cuando falta evidencia y no hay conflicto, conserva el fallback existente.

El servicio de detalle TiendaNube también conserva una inconsistencia como salida terminal. No toma un resultado de búsqueda para sustituir una ficha contradictoria.

Verificación: 47/47 en `worker.test.ts`, `products-detail-service.test.ts` y `known-product-detail.test.ts` durante integración; revisor final 74/74 incluye consumidores. Las fixtures prueban no llamar búsqueda/observación después del conflicto y conservar el detalle válido. Runtime: el harness público importa `fetchKnownOffer` real para las 36 fuentes; no adquiere jobs ni persiste DB.

Reversión: los dos consumidores y sus regresiones. No requiere retirar lectores ni modificar leases, permisos o datos. No cierra la recuperación operativa del refresh.
