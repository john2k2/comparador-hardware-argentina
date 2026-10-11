# Reparación explícita de asociaciones privadas

`association-local.mjs` mueve una oferta entre dos productos **existentes** de SQLite. No observa precios ni elige un destino por semejanza.

El coordinador debe aportar `offerId`, `expectedProductId`, hash de toda la fila, `targetProductId`, título público y evidencia con URL, fecha y SHA256. Las dependencias deben implementar las reglas reales de identidad y verificar el artefacto.

`planAssociation` sólo valida. `applyAssociationPlan` confirma oferta, auditoría, cola, resúmenes, proyección y nueva generación en una transacción. El precio, stock y fecha originales permanecen intactos. La base histórica y actual de esa oferta se retiran; se necesita otra observación para volver a compararla.

Un destino desconocido, una variante distinta, un lease activo o una fila alterada rechazan el plan. Una repetición exacta es idempotente. El backoff conserva su fecha e intentos.

Los callbacks son síncronos y no pueden llamar la red. Deben reconstruir ambos productos, excluir la oferta movida y devolver una ventana de caché real. Un error revierte también la creación de auditoría.

El adaptador admite una captura `public-catalog` de CompraGamer como evidencia de identidad. Exige categoría, ID público `cg-N`, referencia de la oferta, título, tienda, fecha real de captura y SHA256 coherentes. No acredita una nueva observación de precio: después del movimiento hay que ejecutar el lector otra vez.

Verificación del núcleo:

```bash
node --test scripts/pilots/cloudflare-catalog/association-local.test.mjs
```

Resultado del 11/10/2026: 18/18. El adaptador real y el transporte tienen pruebas separadas. El ensayo operativo está documentado en `docs/direccion/PILOTO_ASOCIACIONES_2026-10-11.md`.

Segunda tanda: 10/10 pruebas del adaptador, incluidas alteraciones de ID, fecha, título, tienda, URL y categoría de captura compartida. Se aplicaron siete reparaciones en la copia completa; cinco recibieron después observaciones reales, tres comparables. Recibos en `outputs/recuperacion-asociaciones-2026-10-11/`. Ningún movimiento renovó por sí mismo el precio.

Reversión: detener los consumidores y restaurar la copia privada anterior a la reparación. No invertir únicamente `product_id`: hacerlo dejaría resúmenes, proyección y auditoría inconsistentes. Esta herramienta no altera Supabase ni producción.
