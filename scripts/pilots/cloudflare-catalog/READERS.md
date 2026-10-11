# Lectores del ensayo de catálogo

Katech exige un precio principal visible. Un precio antiguo en metadata o una recomendación no reemplaza una ficha sin precio. Un 404 queda identificado como `not-found`; no significa falta de stock.

FullH4rd admite la grilla `.results-card` y el formato anterior `.item`. Conserva centavos y sigue el enlace de página siguiente declarado. Los IDs de publicación son numéricos. El botón Comprar no demuestra stock; una PC no se transforma en GPU por la categoría solicitada.

El bloqueo de Cloudflare sigue siendo un bloqueo: adaptar el HTML no habilita automáticamente HTTP. El ensayo REA del 11/10 confirmó 403; Chrome permitió revisar fichas públicas. El lector no reutiliza cookies de Chrome.

La segunda prueba REA con Chrome visible, URL sin www y doce segundos de espera recibió 403 y terminó en «Un momento…». Chrome habitual sí permitió verificar dos variantes. Las sugerencias públicas usan POST a `/_func/search.php` y `/_func/searchmob.php`; sus seis resultados sin precio ni stock no constituyen un catálogo completo. No existe todavía un flujo automático FullH4rd acreditado.

La prueba local con curl_cffi 0.16.3 también recibió 403/desafío en dos procesos independientes y sin cookies iniciales. Dos solicitudes, cero observaciones de precio/stock; no se habilitó el lector automático. Resultado y reproducción: `docs/direccion/FULLH4RD_CURL_CFFI_2026-10-11.md`.

GoldenTech: la etiqueta principal visible «Disponible en24–48 hs» informa disponibilidad pendiente (`unknown`), aunque un indicador genérico diga stock bajo. Metadata, texto oculto o recomendaciones no cambian esta decisión. Una ficha sin stock explícito continúa agotada.

Mexx: tres fichas públicas sin precio principal y con «NO DISPONIBLE» devuelven ausencia de observación. Un precio/InStock antiguo de metadata y una recomendación con precio no habilitan la oferta ni renuevan su fecha.

CompraGamer usa catálogo, subcategorías y marcas públicos. La fecha viene de la recepción real del catálogo. El consumidor exige publicación, categoría y atributos exactos antes de persistir. Una caché anterior al lease no renueva frescura.

Verificación: 52/52 pruebas Vitest de FullH4rd/Katech y 21/21 del consumidor local. Evidencia de ejecución y límites en `docs/direccion/PILOTO_ASOCIACIONES_2026-10-11.md`.

Segunda tanda: 115/115 Vitest de WooCommerce, detalle GoldenTech y DOM conocido. Lectura real GoldenTech posterior al arreglo: $454.586, stock desconocido, no comparable. Las tres lecturas Mexx devolvieron ausencia de observación correctamente. Artefactos privados en `outputs/recuperacion-asociaciones-2026-10-11/` y `outputs/mexx-reader-2026-10-11/`.

Reversión: restaurar los lectores y el bundle del consumidor anterior. Los cambios de lectores no requieren migración ni publicación de la página. Restaurar código no revierte observaciones ya guardadas en una copia privada.

FullH4rd queda diferido por decisión del usuario: el selector automático lo excluye incluso si conserva una oferta pendiente.

37Bytes: sólo SSD con prueba estricta y URL `/productos/`. Precio principal visible, metadata consistente y variante seleccionada o única con stock son obligatorios. El precio condicional por transferencia permanece separado. Ensayo real: NV3 1 TB a $384.145, stock bajo; sincronización y búsqueda acreditadas en `docs/direccion/TERCERA_RECUPERACION_CATALOGO_2026-10-11.md`.

RAM: la prueba separada `ram-identity.ts` acepta Single/un módulo explícito, U-DIMM y los alias Grey/Gray/Gris, blanco/negro. Exige capacidad total, kit coherente, generación, frecuencia, CL, formato, color y familia. Conserva título, RGB, perfiles y condición; no deduce atributos del SKU. Single Rank/Channel no acredita un módulo. Contradicciones y signos ×/* se rechazan porque el subject normalizado pierde esos signos. Las claves persistidas no cambian; una prueba antigua con sólo `model` deja de aprobarse y necesita otra observación.

Verificación RAM del 11/10: 193/193 Vitest en seis suites de identidad/lectores; 35 observaciones persistidas revalidadas después de serializarlas, 17 comparables por identidad/stock. La elegibilidad de una oferta no garantiza que la ficha preferida de búsqueda la incluya: comprobar también el resultado de la búsqueda.
