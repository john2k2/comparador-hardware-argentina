# Preparación del espacio editorial de AdSense

Corte 28/09/2026 01:05 UTC, todavía 27/09 en Argentina y Chile. G23 pasa a **en revisión** por avance comprobado. No hay publicidad activa ni solicitud de revisión enviada.

## Cuenta y archivo público

En la cuenta correcta de AdSense se creó el bloque **Comparador — piloto editorial 300x250**, tipo Display fijo, ID público `5184718883`, editor `ca-pub-4559843439616138`. Google mostró el código generado y el bloque persistió al volver a abrir la lista. Crear el bloque no lo inserta en la página. No se completaron datos personales de pagos ni se modificaron otros sitios.

La lista de sitios mantiene `Debe revisarse` y ads.txt `No se encuentra`, con última actualización 27/09 18:54 GMT-3. Cuatro peticiones espaciadas al archivo —raíz/www, navegador y User-Agent Mediapartners-Google— devolvieron HTTP 200, texto plano y línea correcta. Imitar un User-Agent no prueba acceso desde la red de Google. El detalle de sitio no ofrece en esta cuenta un botón separado `Buscar actualizaciones`; no se accionó `Solicitar revisión` para forzar el estado.

Google documenta que el estado de ads.txt puede tardar días en reflejar cambios y, con pocas solicitudes de anuncios, hasta un mes. No prometemos un plazo ni atribuimos este aviso a un archivo ausente. Fuente: https://support.google.com/adsense/answer/12171612?hl=en.

## Implementación y alcance

`ADSENSE_EDITORIAL_PILOT` conserva el ID real, tamaño y la lista exacta de rutas. Su estado continúa desactivado. `EditorialAdPreview` se integra después de la metodología editorial, separado de precios y CTA. Es una maqueta de desarrollo y no una integración del proveedor.

| Ruta | Condición de maqueta |
|---|---|
| `/guia/pc-gamer-2-millones` | Metodología presente y siete partes con oferta elegible |
| `/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x` | Metodología presente |
| `/comparativa/rtx-4060-vs-rx-7600` | Metodología presente |

Solo aparece con `NODE_ENV=development` y `ADSENSE_PREVIEW=1`. En producción devuelve null incluso si alguien configura esa variable en 1. Rutas parecidas, otros presupuestos, búsqueda, fichas, auth, admin y contacto quedan fuera. Una coincidencia de metodología no sustituye la aprobación humana de G20.

El espacio mide 300×250 y lleva el rótulo **Publicidad**. Si el contenedor tiene menos de 300 px se oculta, sin recortar ni escalar anuncios. No incorpora script, etiqueta ins, llamadas a Google, enlaces, animaciones ni controles de compra. No cambia CSP ni interpreta la elección GA4 como permiso publicitario.

La dimensión fija facilita medir un primer espacio estable. Google recomienda formatos adaptables para sitios responsivos y advierte que un tamaño fijo puede limitar inventario/ingresos. Es un compromiso del piloto, sujeto a evaluación con datos reales; no una optimización de ingresos demostrada. Fuentes: https://support.google.com/adsense/answer/9274025?hl=en-GB y https://support.google.com/adsense/answer/9185043?hl=en.

## Validación realizada

- Tres pruebas de guardas: producción con variable activa, exclusión de rutas similares/privadas y contenido/solicitud de maqueta ausentes.
- ESLint, TypeScript y build aprobados.
- Desarrollo en 1280/390/320 px: tres rutas HTTP 200; espacio 300×250 donde cabe, oculto en 320; ningún desbordamiento, error JavaScript, ins, script o petición publicitaria.
- Producción local con `ADSENSE_PREVIEW=1`: mismas tres rutas HTTP 200; maqueta ausente, sin hueco reservado, errores ni solicitudes publicitarias. Incluye elección GA4 afirmativa y negativa, con hosts externos bloqueados para no contaminar métricas. No prueba consentimiento TCF, anuncios reales ni reacción del proveedor ante bloqueadores.
- Capturas de escritorio/móvil inspeccionadas. Revisión Impeccable independiente: **ship**, sin arreglos materiales, limitada a esta extensión local. No certifica la página completa ni CMP.

Evidencia local privada: `cortes/2026-09-27/adsense-preparation/ADS-TXT-PUBLICO.json`, `ESPACIO-LOCAL.json`, `PRODUCCION-LOCAL.json`, `bloque-creado.png`, `bloque-guardado.png` y capturas del espacio. No se publican capturas autenticadas. En el primer JSON de maqueta `width` mide el slot; viewports 1280/390/320, en ese orden, conservados por el procedimiento y nombres de captura.

## Controles que siguen abiertos

Antes de una integración activa: revisión humana G20; país/perfil administrativo G18; contacto exterior G04 y divulgaciones G21; estado apto del sitio y confiabilidad G01/G02. Revisar la configuración real de optimización de tamaños antes de prometer dimensiones fijas a visitantes. La cuenta conserva anuncios automáticos desactivados para el comparador; el indicador de optimización automática por sitio estaba activado y no se cambió.

La CMP certificada de Google debe comprobarse con entrega regional, consentir/no consentir/gestionar, retiro y navegación entre páginas. La función oficial de revocación es `googlefc.callbackQueue.push(googlefc.showRevocationMessage)`. Google indica que el enlace automático de revocación se añade a sitios aprobados que contienen el código AdSense; no se cierra ese control usando una maqueta local. Fuente: https://support.google.com/adsense/answer/10959060?hl=en.

G23 continúa abierto: faltan el cargador único del proveedor, la CSP con orígenes observados exactos y pruebas reales de privacidad, carga, estabilidad visual y bloqueador. No habilitar publicidad por cambiar una variable. G24 conserva sus dependencias; la revisión de Google no se solicitó.

## Publicación comprobada — 28/09/2026 01:14 UTC

Commit `db38b9e` subido a main y build Workers `e5307819-5af7-466d-8c08-e7164f42206a` terminado con success. Las tres páginas piloto devolvieron HTTP 200 en 1280/390/320 px, sin maqueta, desbordamiento, error JavaScript, ins, script o petición publicitaria. Evidencia: `PRODUCCION-PUBLICA.json`. Este corte verifica que la preparación no activa anuncios ni huecos de maqueta; no cierra disponibilidad sostenida G01 ni frescura G02.

El tablero cambió solo E46 (In Progress), G46 (inicio27/09) y B50 (nota de fuente). Comparación del XLSX: 865 expresiones de fórmulas, estilos, dimensiones, filas, merges, validaciones, formato condicional, vistas y referencias de dibujos conservados. Render inspeccionado. La automatización existente se actualizó conservando horario/estado y silencio sin cambios materiales; incorpora esta distinción entre preflight y proveedor real, sin permiso para activar anuncios.
