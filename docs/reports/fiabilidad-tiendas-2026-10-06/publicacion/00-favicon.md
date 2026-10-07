# Favicon coherente con Comparador Hardware

Jonathan confirmó que el problema al buscar en Google es el ícono junto al nombre del sitio. El corte público encontró un ICO con triángulo de Vercel y un SVG con la C del Comparador. El ICO publicado en raíz/www coincidía exactamente con el archivo de `src/app/favicon.ico`. HTTP/robots no mostraron bloqueo en ese corte; la consulta textual no permite afirmar qué imagen eligió Google en el resultado visto por Jonathan.

Se convierte la C existente de `public/favicon.svg`, sin rediseño, a ICO de 16/32/48/256 px y Apple PNG de 180 px. Metadata declara ICO raster, conserva el SVG y alinea shortcut/Apple. El SVG fuente conserva su SHA256. Las dos entradas ICO de Next, automática y explícita, tienen ahora el mismo gráfico.

Verificación focal: cada frame decodificado coincide byte a byte con el raster de la fuente SVG; revisión visual de 16/32/48/180; decodificador nativo acepta ICO256; ESLint del layout y diff check aprobados. `favicon-local.json` conserva hashes/dimensiones. El build final verificará el head; el corte público posterior comparará bytes de ambos hosts.

La aparición en Google exige rastreo/procesamiento y no tiene plazo garantizado. [Documentación oficial](https://developers.google.com/search/docs/appearance/favicon-in-search). No se cambian títulos, canonical, robots o cuentas de Search Console.

Reversión: restaurar ICO, metadata `icons` y retirar el nuevo Apple PNG. No requiere cambios de datos, rutas, logo SVG o configuración de cuenta.
