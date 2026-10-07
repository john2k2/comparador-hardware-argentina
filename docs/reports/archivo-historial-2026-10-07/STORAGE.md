# Adaptador privado de Supabase Storage

El usuario confirmó Supabase Storage para el pequeño piloto. Esta unidad sólo copia y verifica archivos; no retira originales de PostgreSQL ni publica el historial.

- Contenedor `catalog-history-archive`, privado, archivo máximo 1 MiB y MIME admitidos `application/gzip` y `application/json`. No modifica políticas RLS; la privacidad efectiva se comprueba con metadatos y una lectura anónima fallida.
- Límite del archivo completo planificado: 5 MiB incluyendo manifiesto. Es un límite del programa para esta entrega, no una cuota global del contenedor aplicada por Supabase. No hay proceso automático que pueda seguir acumulando lotes.
- Ruta inmutable `v1/<SHA256-del-manifiesto>/...`. `upsert:false` y comparación completa impiden reemplazar otra entrega. Una escritura de resultado ambiguo se considera recuperada sólo cuando la descarga coincide byte a byte.
- El manifiesto se sube al final. Toda entrega requiere descarga de cada objeto, validación completa de esquema/conteos/hashes/filas y comprobación del proyecto/corte/ancla esperados.
- Tamaño del Blob comprobado antes de convertir a ArrayBuffer; también se comprueban bytes y hashes. El SDK ya acumula la respuesta para crear el Blob: este control no demuestra un límite anterior de transferencia. El bucket del piloto limita archivos remotos a 1 MiB.
- Las credenciales existentes se leen exclusivamente en Node desde la configuración privada indicada; no se guardan en manifiestos, recibos, archivos, código público o navegador. Cliente sin sesión persistida y tiempo límite por solicitud.

## Ejecución manual del piloto

```sh
node scripts/history-archive-pilot.mjs upload --server-config /ruta/privada/.env.local --date 2026-07-05 --out tmp/history-archive-pilot-2026-10-07/source --create-bucket
```

Repetir sobre la misma entrega sin `--create-bucket` verifica y reutiliza los mismos objetos; no duplica el contenedor ni amplía el corte. Verificar previamente cuota/uso, contrato del bucket y ausencia de permisos generales para usuarios del sitio. No guardar datos personales dentro de estos archivos de catálogo.

## Verificación y rollback

`node --test scripts/lib/history-archive-storage.test.mjs`: cuatro casos cubren copia privada y repetición, corrupción, archivo inválido/sin permiso de creación y rechazo de tamaño antes de conversión. La revisión independiente ensayó tres errores ambiguos/interrupciones adicionales y comprobó su recuperación sin reemplazo. El runtime real y sus límites están en README.md y sus recibos.

Retirar `scripts/lib/history-archive-storage.mjs`, su test y este documento revierte el adaptador local, pero deja las copias remotas intactas. Deshabilitar una futura ejecución no debe borrar originales ni archivos. La eliminación de un prefijo privado se prepara con su inventario y operación específica cuando corresponda; no forma parte del piloto.

Fuentes comprobadas: [creación/restricciones](https://supabase.com/docs/guides/storage/buckets/creating-buckets), [acceso](https://supabase.com/docs/guides/storage/security/access-control), [límites](https://supabase.com/docs/guides/storage/uploads/file-limits). Mantener cuota para futuros archivos del proyecto; el piloto no reserva todo el GB gratuito.
