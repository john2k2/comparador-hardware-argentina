# Recursos compartidos y derechos — 27/09/2026

Inventario focalizado de portada, guías y comparativas. Código e historial prueban uso y existencia, no licencia ni procedencia original. Estado desconocido no equivale a infracción demostrada o autorización concedida. No sustituye revisión del responsable.

| Recurso | Uso y evidencia | Procedencia/licencia | Acción pendiente |
|---|---|---|---|
| Press Start 2P | next/font/google en src/app/layout.tsx; fuente pixelada | Fuente oficial Google Fonts, SIL OFL 1.1. Aviso y licencia conservados en public/licenses/PressStart2P-OFL.txt | Conservar licencia al distribuir; no cambiar nombre reservado en una derivación |
| Inter/sistema | globals.css declara fallback de lectura | El layout no importa Inter; una declaración CSS no acredita descarga o distribución. Revisar fuente realmente resuelta si cambia integración | No atribuir licencia a un archivo no identificado |
| Logo header | SVG inline de Navigation.tsx | Jonathan declaró el 27/09 que fue creado para el proyecto sin material externo | Conservar esta declaración y archivo fuente si existe |
| Favicon | public/favicon.svg | Jonathan declaró el 27/09 que fue creado para el proyecto sin material externo | Conservar esta declaración y archivo fuente si existe |
| Cielo/fondo | CSS gradients y SVG inline del layout | Implementado en código, sin atribución externa; comentarios de inspiración visual no prueban copia ni derechos | Confirmar originalidad de formas/ilustraciones utilizadas |
| Sprites | public/sprites/pixel-art.svg | Jonathan declaró el 27/09 que fueron creados para el proyecto sin material externo | Conservar esta declaración y archivo fuente si existe |
| OG actual | public/og-image-2026-09-27.png, 1200×630 | Publicado en 3bc2d78, uso social verificado. Jonathan declaró el 27/09 que fue creada para el proyecto sin material externo | Conservar esta declaración y archivo fuente si existe |
| OG legado | public/og-image.png | Conversión desde SVG registrada en cdc163f; todavía usado como Organization.logo y metadata de producto | Documentar fuente y revisar consistencia de marca; no asumir permiso por conversión |
| OG SVG histórico | public/og-image.svg | Sin uso actual encontrado en código de pilotos; historial c34bf9c | Conservar como histórico; no añadirlo al piloto sin revisar procedencia |
| Fotos de comercios | Fichas de catálogo fuera de las tres piezas piloto | Permisos por tienda no acreditados | Permanecen fuera del inventario publicitario inicial; no extender ese permiso por aparecer en un comparador |

Las tres piezas piloto no incorporan fotos de comercios en su cuerpo editorial; heredan recursos compartidos del layout. La declaración del titular aclara la procedencia de cuatro recursos, pero no resuelve la imagen OG legada, el fondo implementado en CSS/SVG ni los permisos de fotos de comercios. G19 mantiene pendiente la revisión de plantillas a escala y de esos recursos; una declaración no se extiende a archivos no mencionados.

Fuente primaria de la fuente: https://github.com/google/fonts/blob/main/ofl/pressstart2p/OFL.txt. Copia obtenida el 27/09/2026. La licencia se conserva sin modificaciones. No se cambiaron ni se retiraron ilustraciones del sitio por falta de documentación.

## Revisión de recursos activos — 28/09/2026, 00:28 UTC

Las filas anteriores conservan el estado de su primer corte. La revisión de `globals.css` y `layout.tsx` distingue el cielo de las ilustraciones: los colores del cielo, las líneas de pantalla y las máscaras se generan con gradientes CSS; las nubes, estrellas, luna y cometa usan referencias SVG a los sprites cuya procedencia Jonathan declaró. No se encontró una imagen de fondo externa en esos dos archivos. Esto acredita las referencias utilizadas en el layout, sin inventar una licencia de terceros ni extender la declaración a fotografías de tiendas.

Se sustituyeron las dos referencias activas restantes a `og-image.png`: Organization del sitio y Organization de la ficha de producto pasan a la imagen social versionada `og-image-2026-09-27.png`, cuya procedencia fue declarada. La búsqueda en `src` ya no encuentra usos del PNG/SVG legado. Los archivos históricos se conservan; no se reutilizarán en nuevos espacios hasta resolver su procedencia. La comprobación pública del cambio se registra aparte, después del build.

Las tres piezas iniciales utilizan recursos compartidos identificados y no fotografías de comercios. Los permisos de esas fotografías siguen **no acreditados** para las fichas del catálogo. Excluir esas fichas del primer piloto no constituye aprobación de Google para el sitio completo ni resuelve sus permisos. El inventario conserva este asunto pendiente para cualquier ampliación publicitaria y para la revisión general de derechos.
