# Unidad 2: hacer comprobables los resultados solicitados

El artefacto solicitado informaba estado y transporte, pero no cuántas ofertas se guardaron ni por qué fallaron las restantes. Esto dificultaba distinguir una adquisición fallida de una publicación sin observación.

El worker conserva el diagnóstico permitido de `claim_offer_refresh`. Después de confirmar la actualización final bajo lease devuelve intentos, observaciones guardadas, comparables y motivos internos de fallo. Una observación confirmada sin stock cuenta como observada y no comparable. Una lectura sin persistencia confirmada no cuenta como observación.

Se distinguen `no-observation`, `product-not-found`, `persist-failed` y `processing-failed`, junto con los códigos de fuente ya existentes. Los resultados parciales anteriores a un fallo posterior se conservan. Una cola vacía sigue devolviendo únicamente `processed:false`; no fabrica actividad.

El entrypoint preserva el diagnóstico al serializar excepciones y conserva los retornos completos. Un resultado fallido mantiene salida 1; un parcial conserva su contrato previo. El harness compila el entrypoint real con runners/transporte aislados, verifica JSON y salida del proceso, y nunca adquiere lotes ni visita tiendas o Supabase.

## Verificación y alcance

Pruebas del worker: adquisición por respuesta/rechazo, precio/URL/fecha exactos, sin observación, rechazo de persistencia realmente alcanzado, parcial, ficha ausente, OOS y fallo de procesamiento sin mensaje privado. Se corrigió el precio omitido en la fixture predeterminada: varias pruebas negativas previas podían fallar antes del comportamiento que pretendían demostrar.

Cinco controles del artefacto: excepción adaptativa, excepción solicitada, error desconocido, retorno adaptativo fallido con acumulados y solicitado parcial. Revisión independiente sin hallazgos materiales en conteos/redacción del worker.

## Reversión

Revertir esta unidad conserva los estados previos del job y elimina sólo nuevos conteos/diagnósticos. Depende del helper de la unidad 1. No requiere DB ni cambios de permisos. La pérdida de resumen ante `REFRESH_LEASE_EXPIRED` final es un límite preexistente; esta unidad no lo declara recuperado.
