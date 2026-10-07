# Dictamen independiente del piloto

Perfil comparador_reviewer, GPT-6.1 Sol/high, sólo lectura; ningún archivo editado ni operación remota. Encargo limitado al candidato y la entrega del 05/07/2026, sin certificar catálogo global o reducción física.

## Hallazgos cerrados

1. El corte de exportación y ancla aceptaban flags libres: quedaron fijados y se rechazan opciones que los amplíen antes de archivos/credenciales.
2. El día solicitado no se verificaba en verify/upload: ahora se comprueba en ambos antes de abrir cliente. La reproducción del día equivocado falla y la del correcto devuelve 759 filas.
3. El tamaño del Blob se comprobaba después de ArrayBuffer: ahora se rechaza primero y el test sobredimensionado no realiza conversiones.
4. Original_price rechazaba signo negativo permitido por el esquema: conserva signo/precisión, mientras price sigue no negativo.

## Evidencia del revisor

- 23/23 casos focalizados aprobados independientemente.
- Cuatro CSV originales contra archivo, offline: 759 filas, ocho columnas iguales, sin reconstruir ambas fuentes con el codec.
- Diecinueve archivos descargados iguales byte por byte a la entrega local; manifiesto SHA-256 52998f35183f27acfbd76dd6e5b74803b50f954eae276905c603217768c46995 y 759 filas verificados.
- Fallos simulados adicionales: escritura confirmada con respuesta 500, lectura 503 y creación de bucket confirmada con respuesta 500; la recuperación conserva objetos y evita reemplazos.
- Delta final del lector remoto sin regresiones materiales. No quedan hallazgos abiertos de esta revisión.

## Evidencia ejecutada por coordinación y revisada por el revisor

Bucket privado/1 MiB, cero políticas y RLS activo; 19 objetos/90.664 bytes; HTTP público y anónimo rechazados. Recuperación real de los objetos y seis grupos aprobados al restaurar esa copia en PG17.11 aislado. 759 originales permanecen, sin recuperación física del historial. Ver recibo.json.

El dictamen acredita sólo la muestra exacta. El SDK acumula el cuerpo antes del Blob, el origen paginado no es transaccional y no hay backup global ni viabilidad de 500 MB demostrados. Go cerrado para el piloto y su evidencia local; no autoriza retirar originales, cambiar políticas o ampliar el barrido.
