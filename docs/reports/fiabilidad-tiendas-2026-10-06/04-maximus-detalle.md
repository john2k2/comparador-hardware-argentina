# Detalle dinámico de una publicación Maximus

Se agrega un lector específico del detalle V6, separado del parser de plantilla. Hace GET de la publicación y una consulta POST anónima a la ruta pública comprobada. Vincula ITEM, SKU/PN, canonical, título principal, moneda ARS y bindings de precio/stock. No utiliza cuentas, carrito, precios sin impuestos o cuotas.

Una respuesta ausente no implica agotamiento. Stock web 0 acredita agotamiento; cantidad ausente conserva desconocido. Cantidad local no sustituye stock online. El precio especial exige condición de pago y campos numérico/formateado concordantes; se conserva la fecha de la consulta real.

Verificación: `npx vitest run src/lib/scrapers/maximus-known-detail.test.ts`: 34 aprobadas. Lectura pública exacta 13444, 07/10 02:44:17–28 UTC: SKU 100-100001237BOX, ARS 323.190 efectivo/transferencia/depósito, tarjeta 359.100, seis unidades web. Replay local con capturas y sin transporte aprobado. No se guardó esa oferta en DB ni se aprobó identidad automáticamente.

Reversión: retirar el módulo y sus pruebas sólo después de retirar el enlace de `known-product-detail.ts` de la unidad 5. No restaura datos ni elimina capturas públicas. El detalle de otras tiendas conserva sus rutas.
