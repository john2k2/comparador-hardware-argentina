# Unidad 1: conservar el diagnóstico de adquisición

El runner adaptativo perdía RPC, fase, duración y código original al devolver `REFRESH_CLAIM_FAILED`. Una segunda falla durante el cierre podía reemplazar también ese resultado y sus acumulados.

Se añade un diagnóstico reconstruido con seis campos permitidos: RPC, fase, ordinal de llamada desde uno, límite, duración y código SQLSTATE/PostgREST válido o `null`. No se infiere transporte por el texto del error. Se conserva el código genérico como contrato externo, sin copiar mensajes, SQL, URLs, argumentos ni tokens del error.

Un fallo de adquisición mantiene intentos, observaciones guardadas, comparables y grupos. Los errores secundarios de liberación, cobertura o guardado final conservan ese diagnóstico y añaden códigos internos en `closure.failureCodes`. La liberación se filtra por el token propio y cada operación de cierre se intenta una sola vez. Los reintentos preexistentes de preparación/persistencia no se amplían.

`closure.summaryPersistence` confirma únicamente el ACK del update final. `unconfirmed` no acredita persistencia ni rollback; la confirmación se añade al resultado después del payload enviado. Si falla la lectura de cobertura, `coverage=null`: no significa cero ofertas. Un fallo de liberación no acredita que se haya liberado el lease.

## Verificación y alcance

48 pruebas focalizadas de helper/adaptativo, incluyendo respuesta con error y promesa rechazada, acumulados antes del fallo, token de liberación, seis fallos secundarios y redacción. La simulación del lote 51 es una fixture; no identifica el ordinal histórico.

Revisión independiente: el hallazgo de pérdida del diagnóstico ante fallo secundario quedó cerrado para un claim diagnosticado. El comportamiento de propagación de otros errores queda fuera de esta reparación. El informe general registra la verificación conjunta y sus límites.

## Reversión

Retirar esta unidad devuelve el diagnóstico genérico previo; no cambia esquemas ni datos. Si se revierte después de la unidad 2, retirar también sus imports de `refresh-diagnostics` en worker/entrypoint o revertir primero esa unidad dependiente. No ejecutar migraciones ni restaurar precios para revertir.
