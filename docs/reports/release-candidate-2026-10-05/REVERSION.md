# Reversión del Worker · candidato del 05/10/2026

Preparado para una publicación posterior expresamente autorizada. Este procedimiento no se ejecutó: producción conservó su versión y no se efectuó una reversión de prueba.

Actualización del 06/10 UTC: la comprobación previa a publicar confirmó otra vez el despliegue y versión indicados abajo al 100 %. Los 559 archivos de aplicación siguen idénticos a los builds probados y `main` continúa en `8b7f58d`. La búsqueda general está corregida; las dos migraciones de lectura ya aplicadas se documentan en [el informe posterior](../search-price-fix-2026-10-06.md). El registro actual está en `outputs/search-price-fix-2026-10-06/publish-readiness.json`.

## Punto de retorno verificado

La lectura de `wrangler deployments status --name comparador-hardware-argentina --json` confirmó una única versión al 100 %:

- Despliegue activo: `acc6c77f-8996-4e92-ad83-678f36a6d218`.
- Versión: `b3a2ab26-1875-4219-b9bf-c827e066f023`.
- Despliegue creado: 02/10/2026, 19:57:37.209529 UTC.
- `wrangler versions view` confirmó que esa versión sigue accesible; fue creada a las 19:57:33.147422 UTC.
- Base Git del candidato: `8b7f58debbeea54fad07a072544ecb6148efc4bd`. La versión de Cloudflare y el commit Git se registran por separado; no se equiparan por coincidencia de fecha.

La lista de despliegues está ordenada del más antiguo al más nuevo en esta respuesta. Se utilizó **deployment status**, no el primer elemento de esa lista, para identificar el punto activo. Los archivos originales con datos de cuenta quedan locales e ignorados; el registro público contiene sólo los campos anteriores.

## Antes de una eventual publicación

1. La búsqueda general por precio y sus controles afectados quedaron resueltos en el informe posterior. Repetirlos si cambia la consulta o su contrato antes de publicar.
2. Actualizar este corte de versión activa inmediatamente antes de publicar. Si otro trabajo cambió producción, no reutilizar automáticamente este punto de retorno.
3. Identificar el commit exacto y conservar su manifiesto. Repetir cualquier validación afectada por cambios posteriores.
4. Obtener la autorización de Jonathan para ese resultado concreto. Las pruebas no constituyen autorización de publicación, cambios SQL, activación publicitaria ni despacho de refresh.

## Si el despliegue autorizado introduce una regresión

Desde el repositorio, la sintaxis del comando se verificó con la CLI instalada. **No ejecutarlo ahora**:

```sh
npx wrangler rollback b3a2ab26-1875-4219-b9bf-c827e066f023 \
  --name comparador-hardware-argentina \
  --message "Revertir candidato de interfaz y catálogo por regresión verificada"
```

Se conserva el aviso interactivo de Wrangler. Esta operación modifica el Worker, no revierte ofertas, precios, stock, asociaciones, observaciones, cuentas o base de datos. Las migraciones `20261006013845` y `20261006014216` de índices y lectura ya están aplicadas: una reversión del Worker conserva esa corrección compatible con el Worker anterior. Revertir SQL requiere una migración independiente según el informe posterior. La propuesta descartada de cardinalidad no debe ejecutarse como parte del release.

Después de la operación autorizada, comprobar la versión realmente activa, portada, búsqueda CPU/GPU, ficha conocida, sitemap, estado de scripts/consentimiento y scheduler. Una reversión correcta exige evidencia del runtime; un comando con salida exitosa por sí solo no la acredita. Registrar fecha y resultado antes de declarar recuperación.

El bloqueo de escáner nuevo no está en ese Worker anterior. Ante un problema causado únicamente por ese bloqueo, el parche alternativo debe mantener el programador y las exportaciones de OpenNext, con revisión y pruebas propias. No volver a desplegar un entrypoint que elimine `scheduled`.
