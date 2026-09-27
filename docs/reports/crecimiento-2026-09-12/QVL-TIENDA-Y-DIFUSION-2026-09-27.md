# QVL, revisión de ScorpioPC y difusión — 27/09/2026

## Sugerencia incorporada al código local

Las fichas de motherboards y el armador de PC ahora incluyen una explicación de la QVL y acceso al soporte oficial de ASUS, MSI, Gigabyte y ASRock. Se identifica el fabricante cuando existe una coincidencia conocida; si no, se muestran las opciones con una advertencia. Los enlaces son directorios oficiales, no una QVL exacta de un modelo que no verificamos.

El armador advierte que falta verificar el código exacto del kit, revisión de placa, CPU, BIOS, cantidad de módulos y frecuencia probada, incluso cuando DDR y capacidad coinciden. Se agregó contenido explicativo y una pregunta frecuente. No figurar en la QVL no demuestra incompatibilidad; figurar no garantiza otra configuración.

**Validación:** 28 pruebas de los tres archivos relevantes aprobadas; lint, TypeScript y compilación de producción aprobados. Se verificó la ficha local de ASRock X870 Steel Legend y su bloque visible. [Captura local](cortes/2026-09-27/difusion/qvl-ficha-local.png). Los cambios están en el repositorio local: **no se desplegaron ni se verificaron en producción**.

**Límite pendiente:** la clave canónica de motherboards usa fabricante/chipset/socket/variantes generales, sin una identificación completa de revisión y MPN. No es evidencia suficiente para generar automáticamente enlaces exactos de QVL ni afirmar compatibilidad por modelo. Revisar identidad antes de añadir validación automática; no se cambió la agrupación del catálogo en esta entrega.

## ScorpioPC: evidencia y límites de confianza

Se revisaron el [sitio](https://www.scorpiopc.com/), [catálogo](https://www.scorpiopc.com/productos), [contacto](https://www.scorpiopc.com/contacto), [garantías](https://www.scorpiopc.com/garantias), preguntas frecuentes y devoluciones. El negocio declara venta de componentes, armado, servicio técnico y envíos nacionales; su ubicación publicada coincide con la ficha de Google Maps. Son declaraciones del comercio, no compras ni servicios comprobados.

| Fuente y corte | Dato observado | Lo que permite concluir |
|---|---|---|
| Google Maps, sesión Chrome, 27/09 | 4,9/5 y 18 opiniones; 17 de cinco estrellas y una de cuatro. Las fechas visibles, ordenadas por recientes y recorridas hasta el final, abarcan una semana a un mes | Hay señales públicas favorables en una muestra pequeña y reciente; no prueban una trayectoria larga ni la experiencia de cada comprador |
| [Registro RDAP de Verisign](https://rdap.verisign.com/com/v1/domain/scorpiopc.com), 27/09 | Registro del dominio: 11/06/2026, 15:31:49 UTC | Fecha del dominio, no de inicio del negocio. La antigüedad de cinco meses mencionada en el comentario sigue siendo autodeclarada |
| Sitio y Maps | Dirección coincidente en Virrey del Pino; sitio indica atención desde las 09:00, Maps desde las 08:00 el lunes. Maps distingue retiro/entrega de compra presencial | Confirmar modalidad y horarios antes de describirlo como local abierto para compra presencial |
| Garantías del sitio | Declara dos años para PC y un año para componentes, con condiciones de fabricante y factura | Condiciones publicadas; atención efectiva de RMA no verificada |
| Enlace fiscal publicado | La apertura del enlace de Data Fiscal agotó el tiempo disponible | Identidad fiscal no verificada; no se interpreta el fallo como falsedad |

La web enlaza su Instagram `scorpiopc.com.ar`; la lectura web fue limitada y no se verificó su antigüedad. La búsqueda pública acotada no aportó una historia independiente sólida. No se declara ausencia de reclamos.

**Decisión:** candidato para evaluar inclusión, sin sello de confianza ni sponsor confirmado. Antes de incorporarlo, verificar identidad fiscal por una fuente accesible, condiciones de acceso al catálogo, correspondencia de precio/medio de pago/stock y modelos exactos en una muestra acotada. Si ofrece descuento por transferencia, conservar por separado precio y modalidad; no sustituirlo por un precio universal. No se implementó scraping, se contactó al comercio ni se envió información personal.

Jev no estuvo disponible entre las herramientas de esta sesión. No se inventó una evaluación o confianza de Jev.

## Difusión y solicitudes de permiso

Se revisaron 22 grupos de PC/hardware entre los grupos de la cuenta. Hay dos publicaciones nuevas visibles: [Universe PC](https://www.facebook.com/groups/511915938935820/posts/28284388767928497) y [Comunidad Gamer Argentina](https://www.facebook.com/groups/compraventadecelularesytecnologia/posts/28519846870959408/), además de la publicación previa en PC Gamers Argentina. Los enlaces nuevos tienen UTM para distinguir su procedencia; todavía no hay cifras de tráfico o clics atribuidos verificadas.

Jonathan autorizó solicitar permiso a administradores. Se enviaron 12 mensajes a contactos únicos: 11 administradores y un moderador, cubriendo 17 grupos. Facebook mostró Enviado. HD Tecnología devolvió un acuse genérico, sin autorizar. No se publicó en esos grupos pendientes. Berazategui no mostró administrador identificable y otro grupo está en pausa con solo moderadores visibles.

Registro completo: [grupos y estado](DIFUSION-GRUPOS-PUBLICO-2026-09-27.csv), [pedidos y textos](PERMISOS-GRUPOS-PUBLICO-2026-09-27.md). Se agruparon pedidos cuando un administrador gestiona varios grupos. Una eventual respuesta debe indicar qué grupos autoriza; el silencio o un visto no son permiso. No se programaron mensajes ni publicaciones automáticas.

G10, G13 y G16 conservan su estado global pendiente: una mejora QVL local, un comercio candidato y una solicitud de permiso no cumplen por sí solos sus criterios completos. No se cerró G02 ni se declaró listo el contacto a sponsors.
