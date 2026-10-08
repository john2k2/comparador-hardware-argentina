# Capacidad comprobada en Chrome — 08/10/2026

Lectura autenticada del proyecto `argen-prices-db` en Supabase, organización Free. Consulta entre 20:49 y 20:56 UTC; sin cambios de plan, pagos, configuración, permisos ni autenticación nueva. La sesión existente de Chrome estaba abierta. El navegador integrado pidió login y se cerró esa pestaña temporal.

## Señales de infraestructura

[Infrastructure del proyecto](https://supabase.com/dashboard/project/zyiyziubpcpgoqlkcrie/settings/infrastructure) mostró **8 GB provisionados y 1,29 GB usados**, 17% de disco. Desglose visible: Database 910 MB, WAL 240 MB, System 169,1 MB. Nano compartido, hasta 0,5 GB de memoria; señal instantánea CPU 5%, RAM 57%, 13/60 conexiones.

La capacidad física libre aproximada es 6,7 GB. No confundir el disco provisionado con la cuota comercial de 500 MB de base. Es evidencia favorable para preparar una reconstrucción serial acotada, no autorización para usar disco ilimitado ni prueba de duración/bloqueo en producción. Los indicadores del panel pueden ir retrasados.

## Cuotas de la organización

En [Usage de todos los proyectos](https://supabase.com/dashboard/org/kfiwqwkjodipapyywoxy/usage), ciclo 20/09–20/10/2026, se comprobó el filtro **All projects**. El panel indica que puede tardar hasta una hora en refrescar:

| Recurso | Panel / cuota | Implicación |
|---|---|---|
| Database Size | 0,954 / 0,5 GB, 191%; fila del proyecto 910,07 MB | Exceso confirmado; reducir tamaño físico y volver a medir. |
| Storage Size | 0 / 1 GB, <1% | No mostró otro consumo relevante en esta organización. Valor redondeado/promediado; SQL mide los objetos del proyecto exactamente. |
| Egress | 0,456 / 5 GB, 9% | Hay margen visible para los respaldos acotados. No certifica crecimiento futuro. |
| Cached Egress | 0 / 5 GB | Sin exceso visible. |

No se interpreta Storage como cero objetos: SQL previo contó 33 objetos y 358.319 bytes; el drenaje añade archivos durante la ejecución. Tampoco se iguala el número retrasado del panel a `pg_database_size` instantáneo. El exceso comprobado es de base, no de Storage o transferencia.

## Entrada reciente y mantenimiento

SELECT agregado a las 20:55 UTC sobre los dos scopes: 05/10, 558 eventos; 06/10, 774; 07/10, 691; 08/10 parcial, 389. No sumar actividad privada ni payloads. Esos días recientes todavía no fueron alcanzados por el drenaje de registros más antiguos al hacer la lectura.

El mantenimiento diario de hasta 1.000 eventos tiene capacidad nominal superior a esos tres días completos observados. No se amplía el cron por el atraso heredado. Quedan por observar su ejecución efectiva, elegibilidad al corte y futuros picos; el tope no garantiza por sí solo que retire 1.000 cada día.
