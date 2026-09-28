# Estado observado en AdSense — 28/09/2026, 15:50 UTC

Consulta motivada por la captura de Jonathan. Se abrió el detalle de `comparador-hardware.com.ar` en la cuenta autenticada de Chrome. Estado **Debe revisarse**, información del estado `—`, botón **Solicitar revisión** visible. No se accionó ese botón. La página no muestra en este detalle un motivo de rechazo; no inferir que esté aprobado ni que carezca de posibles incumplimientos.

El aviso de la cuenta indica que falta añadir información para pagos y vincular el sitio para empezar a obtener ingresos. El perfil administrativo mantiene sus pendientes de G18; no se completaron formularios personales, términos ni información bancaria. La etiqueta de propiedad se verificó públicamente de nuevo, pero esta lectura no mostró una nueva confirmación de Google. La confirmación explícita del 27/09 se conserva como evidencia anterior de G22.

## Archivo ads.txt

La columna **Estado del archivo ads.txt** conserva **No se encuentra** y última actualización **27/09/2026, 18:54 GMT-3**. La línea ofrecida en el método Fragmento de ads.txt coincide con el archivo público:

```text
google.com, pub-4559843439616138, DIRECT, f08c47fec0942fa0
```

Comprobación ligera y espaciada: `https://comparador-hardware.com.ar/ads.txt` y `https://www.comparador-hardware.com.ar/ads.txt` devuelven HTTP 200, `text/plain` y esa línea exacta. La portada raíz devuelve 200 y el metadato `google-adsense-account` de esta cuenta. `robots.txt` responde 200 y permite `/ads.txt` a Googlebot y Mediapartners-Google según su contenido. El User-Agent usado en las peticiones no prueba que Google haya rastreado el archivo ni la accesibilidad desde todas sus ubicaciones.

No se encontró un botón **Buscar actualizaciones** en los controles visibles de este detalle. No se eliminó ni volvió a añadir el sitio, ni se modificó el archivo correcto para intentar acelerar el reconocimiento. Según Google, los cambios de ads.txt pueden tardar días en reflejarse y hasta un mes con pocas solicitudes publicitarias. Esto permite considerar retraso de rastreo como explicación posible, sin confirmar que sea la única causa. [Guía oficial de ads.txt](https://support.google.com/adsense/answer/12171612?hl=es), [comprobación de accesibilidad](https://support.google.com/adsense/answer/7679060?hl=es).

## Decisión

**Debe revisarse** significa que Google todavía no ha comprobado el sitio; no es por sí mismo un rechazo. La solicitud se inicia mediante Solicitar revisión tras las tareas requeridas de la cuenta. [Estados oficiales de sitios](https://support.google.com/adsense/answer/12170222?hl=es).

La preparación interna sigue abierta: datos administrativos reales, revisión del contenido corregido, confiabilidad del sitio/catálogo e integración de consentimiento publicitario. Esos controles no se presentan como un mínimo de tráfico ni de artículos exigido por Google. Se conserva G22 completado a su alcance de publicación/verificación de propiedad; no se cierra G24 ni se declara ads.txt reconocido por Google. No cambian estado, prioridad, responsable o fecha del tablero.
