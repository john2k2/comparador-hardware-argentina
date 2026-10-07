# Unidad 3: detectar una velocidad RAM contradictoria

La ficha G02 `MEMORIA RAM 16GB DDR4 3200 KINGSTON FURY BEAST RGB` omite la unidad de velocidad. La publicación GamersPoint retenida dice `3600MHZ`; la guarda previa no reconocía la contradicción 3200/3600.

Ahora reconoce velocidades redondas sin unidad inmediatamente después de DDR3/4/5. Compara sólo cuando ambas velocidades son conocidas. No utiliza números aislados ni referencias precedidas por SKU, MPN, modelo, código o año, incluyendo delimitadores `SKU (` y `MPN: [`. Los valores con MHz/MT/s mantienen el tratamiento anterior; una velocidad sin unidad que no termine en `00` permanece desconocida.

La contradicción mantiene pendiente la oferta aunque conserve una aprobación antigua. No aprueba identidad, reconstruye asociaciones, crea prueba de atributos ni modifica frescura, precio o stock. Corsair RS/LPX continúa bloqueado por su conflicto real de serie.

## Verificación y alcance

52 pruebas focalizadas de identidad de oferta, prueba de atributos y producto. Incluyen nombre literal, sentido inverso, misma velocidad con/sin unidad, aprobación anterior, omisión y distractores. La revisión independiente descubrió el caso `SKU (DDR4 3600)`; se corrigió y se comprobó en ambos sentidos, conservando el rechazo de la publicación real de 3600 MHz.

Los tests y la revisión no prueban que las RAM pendientes sean comprables. El detalle dinámico de Maximus sigue pendiente de un adaptador con precio/stock/identidad corroborados; no se relaja esa guarda.

## Reversión

Revertir esta unidad restaura la detección anterior de velocidades con unidad. No hay migración ni modificaciones de registros; no es necesario restaurar asociaciones. La unidad es independiente del diagnóstico de adquisición y no amplía fuentes ni colas.
