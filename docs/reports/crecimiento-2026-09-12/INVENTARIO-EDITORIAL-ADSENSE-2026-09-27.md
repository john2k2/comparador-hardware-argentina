# Inventario editorial para AdSense — 27/09/2026

Auditoría de código y muestra acotada, no aprobación de Google ni revisión humana atribuida al titular. Fuente de código: main 4bf5bd2; mejoras de consentimiento posteriores en desarrollo. Lectura independiente bulk-reader contrastada con página de guía, FAQ, precios y ficha en el coordinador. No se revisó cada una de las miles de fichas.

## Muestra y decisiones

| Superficie | Valor observado | Problema y acción | Anuncios iniciales |
|---|---|---|---|
| Portada / | Comparador, categorías y acceso a herramientas; 200 en corte de 21:06 UTC | Disponibilidad aún en observación; ofertas necesitan verificación de frescura G02 | Excluida |
| /comparar/procesadores | Catálogo agrupado y paginado, precios por tienda; 200 en 21:06 UTC | Contexto y precios de variantes requieren identidad/frescura verificadas | Excluida |
| /comparar/placas-de-video | Comparación de variantes y tiendas; 200 en 21:06 UTC | Sin cobertura reciente GPU en muestra G02 del día; no asumir precio actual | Excluida |
| /guia/pc-gamer-1-millon | Selección por presupuesto con siete piezas, costos parciales y límites; 200 en nuevo corte | No expone fecha por oferta; productividad genérica; definición conserva FPS antiguos que el render oculta | Pendiente de mejorar |
| /guia/pc-gamer-2-millones | Explica plataforma AM5/DDR5, piezas y costos | Necesita metodología, fuentes técnicas exactas, autoría responsable y fecha por oferta | Prioridad G20 |
| /guia/pc-gamer-3-millones | Alternativa de mayor presupuesto y composición | Misma plantilla; afirmaciones históricas de rendimiento sin prueba propia | Pendiente |
| /comparativa/rtx-4060-vs-rx-7600 | Fuentes de pruebas externas y precios argentinos | Separar specs del fabricante, resumen de pruebas y catálogo. Registrar fecha y costos excluidos | Prioridad G20 |
| /comparativa/ryzen-5-7600x-vs-ryzen-7-5700x | Costo de plataforma y explicación CPU | Una review del 7600X no prueba cada afirmación comparativa sobre el 5700X | Prioridad G20 |
| /comparativa/rtx-5070-vs-rtx-4070 | Resume pruebas externas, raster y RT | Registrar alcance de fuente, fecha y diferencia entre benchmark y precio local | Pendiente |
| Ficha i5 12400, ID agrupado-procesadores-intel-core-i5-12400-gfjrbb | Ofertas por tienda, estado y fecha; volvió a 200 en nuevo corte | Texto por categoría repetido; no hay ficha fabricante por SKU; 503/1102 en corte anterior | Excluida |
| Ficha GPU de muestra G02 | Código comparte generador por categoría | Stock/identidad/render de esa ficha no verificados en este inventario; no afirmar calidad editorial de todo el catálogo | Excluida |
| Ficha ASRock X870, ID agrupado-motherboards-asrock-am5-x870-pt7uwy | QVL visible y soporte oficial; volvió a 200 en nuevo corte | Compatibilidad exacta manual; 503/1102 anterior. Plantilla no sustituye revisión por modelo | Excluida |

La comprobación de una ficha GPU y de las dos piezas prioritarias en runtime sigue pendiente para cerrar la muestra completa. Las lecturas de código no se presentan como revisión de una página pública que no se abrió.

## Evidencia de código

- Guías: src/app/guia/[slug]/page.tsx, budget-guides-data.ts, budget-guide-pricing.ts, GuideComponentRows.tsx. La fecha editorial global es 2026-09-02, diferente de observación de precios. No actualizarla globalmente para simular revisión de todas las piezas.
- Comparativas: src/app/comparativa/[slug]/page.tsx y comparisons-data.ts. Lectura hasta 1.000 productos por categoría: revisar costo del Worker y elegir una lectura específica antes de ampliar tráfico.
- Fichas: src/app/product/[id]/page.tsx y product-seo-content.ts. Texto por categoría es contexto general, no ensayo propio del SKU. Mantener advertencias de stock/identidad y no inventar reseñas ni ratings.
- GuideFpsPanel evita publicar FPS estimados; limpiar afirmaciones antiguas de datos fuente para que no reaparezcan en otra superficie.

## Derechos y responsabilidad

No se encontró registro de licencia/permiso por tienda para las imágenes externas ni una ficha de procedencia de todos los assets locales. Se registra **desconocido**, no permiso concedido. La autoría de un asset generado o su presencia en Git no demuestra permiso para todas sus fuentes.

Antes del piloto: usar en páginas permitidas contenido e imágenes propios o con derechos documentados; evitar copiar textos de tiendas. Las fichas con imágenes de comercios quedan fuera del inventario publicitario inicial. Para cualquier imagen utilizada como pieza editorial, anotar origen, licencia/permiso, fecha y restricciones, o sustituirla por una alternativa propia. No contactar comercios sin autorización concreta.

No atribuir revisión humana, ensayos, FPS ni experiencia de compra al titular sin su confirmación. Se puede identificar a Jonathan como responsable del proyecto; distinguir redacción asistida, fuentes externas y revisión humana pendiente. dateModified indica la modificación real de la pieza, no aprobación de autor.

## Próximo lote G20

1. Guía de dos millones: metodología de selección, costos excluidos y límites de compatibilidad, fuentes AM5/DDR5 y fecha de cada oferta registrada.
2. Comparativa CPU: diferencia entre upgrade AM4 y armado nuevo AM5; presupuesto total antes de decidir; límites de la fuente y ausencia de pruebas propias.
3. Comparativa GPU: precio observado por variante, VRAM/consumo verificados en fabricante y advertencia de que juegos/ajustes/configuración cambian resultados.

G19 sigue en revisión hasta completar runtime y registro de derechos. G20 requiere cambios publicados y revisión humana de las tres piezas. G21 es independiente: consentimiento y privacidad se implementan y se prueban antes de cualquier publicidad; falta CMP certificada para los territorios aplicables y comprobar recepción de consultas. El nuevo control de GA4 no es esa CMP.

## Mejoras de la muestra — 27/09/2026, f2ac9f3

Las tres piezas G20 ahora tienen metodología y fuentes primarias, fecha por pieza y alcance de redacción asistida. Runtime local desktop/móvil verificado en las tres, sin errores JS ni desbordamiento. Los cambios se publicaron en GitHub; la comprobación pública del nuevo build se registra aparte en VALIDACION. Comparativas usan consulta por modelo acotada y ganador solo con ofertas disponibles observadas en las últimas tres horas. Las guías muestran fecha por oferta y distinguen selección/costo parcial de una PC comprable hoy. Las afirmaciones de FPS no se presentan como ensayo propio.

Las tres piezas no incorporan fotografías de tiendas en el cuerpo editorial: se revisaron las plantillas y el módulo nuevo. Esto no demuestra derechos sobre el logo, fondo, imagen OG u otras rutas del catálogo. El origen/licencia/permiso de assets compartidos sigue por documentar. No se otorgó aval legal a las imágenes por estar en Git. G19 y G20 siguen abiertos hasta completar sus evidencias y la revisión humana del responsable.
