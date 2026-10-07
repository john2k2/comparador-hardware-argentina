# Retiro autorizado del lote respaldado

**Aplicado y reconciliado: exactamente 250 eventos vencidos retirados de producción. La recuperación física de capacidad sigue en cero.** Jonathan aprobó este lote mediante «si hacelo», después de la pregunta explícita sobre esos 250 eventos respaldados y la conservación de cualquier fila cambiada.

## Resultado del 07/10/2026, 21:25 UTC

| Comprobación | Resultado |
|---|---|
| Lote preparado y aprobado | 250: 149 endpoint y 101 tienda |
| Descarga nueva del respaldo antes del retiro | 250 verificados; mismos bytes y hashes |
| Preview inmediato | 250 coinciden en seis campos; cero cambiados o ausentes |
| Ejecución | Una, sin reintento; 250 retirados |
| Claves reconocidas por la operación | Exactamente las 250 de la selección custodiada |
| Lectura independiente posterior | Cinco GET; cero de esas claves presentes |
| Contadores por scope | Endpoint −149; tienda −101; otros iguales |
| Caché activa | 1.681 antes y después; cada scope conserva su conteo |
| Caché total | 347.501 → 347.251 filas |
| Tamaño de base | 930.827.411 B → 930.827.411 B |
| Tamaño físico de caché | 245.456.896 B → 245.456.896 B |
| Historial | 176.742.400 B antes y después; no se retiró historial |
| Storage posterior | Bucket privado; 21 objetos/102.016 B; cero políticas |
| Revisión independiente Sol/high | Claves, hashes, descarga y deltas reconciliados; cero hallazgos materiales |

La transacción comparó los seis campos respaldados y el corte de vencimiento, con límites de 3 s y 500 ms para espera de locks. Antes se verificó que la tabla no tuviera triggers propios ni relaciones entrantes que propagaran el borrado. El apply corresponde al SHA-256 **28e6aa1bf4ed207b225f7fefc5fffef5ed59db7e5e19e253d366a3706f9ae58e**, revisado en la entrega anterior; no se volvió a seleccionar otro lote.

El conector finalizó sin error y el SQL incluía COMMIT, pero no devolvió su command tag nativo. No se inventa ese ACK: el resultado confirmado se apoya además en la ausencia de las 250 claves mediante otra conexión REST posterior y en el descenso exacto de sus dos scopes. No hubo reintento. La igualdad de conteos de otros scopes no equivale a una comparación íntegra de cada fila ajena.

## Recuperación y límites

El respaldo consta de dos objetos privados, 11.352 B, con manifiesto **6558b3d3ccc94614e90a16264c835cd604a1f8afac18ef7791e50847e848a654**. La descarga nueva anterior al retiro verificó sus bytes; el inventario posterior conserva los objetos y la privacidad. La entrega previa comprobó recuperación de seis campos y diez casos en PG17.11 local. No se ejecutó una restauración productiva y este archivo no constituye un respaldo global de Supabase.

**Ahorro físico medido: 0 B.** Este retiro comprueba el mecanismo del lote recuperable; no demuestra margen bajo la cuota ni autoriza otro borrado. No se ejecutó mantenimiento, VACUUM, cambios de índices, scheduler, políticas, plan o despliegue. El código de respaldo permanece local; esta ejecución manual aprobada no significa que ya exista mantenimiento automático en producción.

La siguiente unidad D02 debe preparar mantenimiento acotado dentro de la programación existente y dimensionar recuperación física y conjunto activo. No conviene repetir pilotos pequeños indefinidamente: ya quedó probado el mecanismo. Ampliar el retiro o tocar el historial exige su selección concreta, equivalencia de lecturas y presupuesto medido.

[Evidencia agregada](verificacion.json). [Preparación y pruebas anteriores](../README.md). La evidencia privada nueva se conserva por separado, con permisos 0700/0600; los recibos anteriores no se sobrescriben. No se repitieron las 96 pruebas operativas ni los diez casos PG: corresponden a la entrega previa, cuyo código no cambió.
