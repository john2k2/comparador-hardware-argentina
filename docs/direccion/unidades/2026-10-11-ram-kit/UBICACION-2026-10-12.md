# Ubicación preservada de la fixture del 11/10

El bundle del 11/10 y su parche congelado conservan contenido, hashes y estado histórico de preparación. El 12/10 la copia autorizada pasó a una rama de integración desde d108. La fixture offline `tmp/ram-kit-f811` contenía 120 archivos que interferían con el glob de TypeScript de la aplicación.

Esos 120 archivos se preservaron con hashes idénticos en:

`/Users/johnortiz/Documents/Codex/2026-10-02/new-chat/outputs/ram-kit-f811-preservado-2026-10-12`

No hubo borrado de la fixture ni limpieza de archivos ajenos. El recibo `fixture-preservation.json` del corte 12/10 guarda la comparación de hashes. Los comandos históricos del README pueden requerir ajustar el path de configuración a esta ubicación o copiar de vuelta una fixture a un contexto aislado que no forme parte de la aplicación.

La prueba de consumidores intactos de d108 y su integración están documentadas en [la unidad del 12/10](../2026-10-12-ram-kit/README.md). Este traslado no modifica la evidencia histórica ni convierte las pruebas offline en una recuperación pública.
