# Impedir importes extranjeros en WooCommerce

El importe de metadatos requiere moneda ARS explícita. Una moneda extranjera en el Offer del Product principal, en metadatos o precio visible termina la lectura conocida. Las URLs relativas se resuelven antes de vincular Product. Un producto relacionado con USD queda fuera de la evidencia principal.

Verificación: 22 pruebas focalizadas Woo antes del último caso de URL relativa; el full verify final y las 74 pruebas del revisor incluyen ese caso. Regresiones: Offer USD con meta amount sin currency, URL relativa, señal visible extranjera, meta ARS correcto y USD relacionado. Transporte simulado; no se afirma que hubiera una oferta real USD publicada incorrectamente.

Runtime: once fuentes Woo en la matriz pública, con resultados buenos, agotados, 404 y bloqueos separados. Ningún HTTP 200 o meta numérico sustituye moneda ni identidad. No se usaron credenciales de tiendas.

Reversión: `woocommerce-shared.ts` y pruebas de esta unidad. No altera variantes elegidas, montos guardados, credenciales o migraciones.
