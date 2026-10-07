# Índices preparados y fuera de aplicación

Jonathan autorizó publicar lectores y diagnóstico el 07/10. La operación de capacidad, borrados y aplicación de índices quedan pendientes. Por ello, los dos SQL preparados se trasladan aquí: no pertenecen a `supabase/migrations` ni al replay automático de CI. La rama original `codex/fiabilidad-todas-tiendas`, SHA `53d471e`, conserva la candidata y su prueba completa.

`catalog_seed_covering_indexes.sql` conserva exactamente la migración probada; `catalog_seed_covering_test.sql`, su regresión. El workflow y el archivo concurrente vuelven al contenido anterior a esa unidad: 75 migraciones, 13 archivos SQL y dos casos concurrentes. Ningún módulo del runtime necesita los índices. El diagnóstico y los lectores conservan sus bytes aprobados.

Verificación: hashes de los SQL movidos iguales a los de `53d471e`; diff de CI/test limitado a la unidad diferida; la publicación ejecutará el replay base en CI. La prueba sintética anterior de la candidata queda como evidencia histórica, no como aplicación remota.

Reversión: mover los dos SQL a sus rutas originales y restituir la línea CI/caso concurrente sólo tras la decisión independiente de aplicación. No ejecutar DDL, borrar datos o cambiar permisos para revertir este movimiento.
