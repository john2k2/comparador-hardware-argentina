# Auditoría Impeccable: interfaz, accesibilidad y rendimiento

Fecha: 12/09/2026. Alcance: portada, búsqueda `ryzen`, ficha de producto y contacto en producción; escritorio (1280 × 720) y móvil (390 × 844), además de lectura dirigida de los componentes y estilos que los sirven.

## Resultado

| Dimensión | Puntaje | Hallazgo principal |
|---|---:|---|
| Accesibilidad | 2/4 | Los CTA rosa/blanco del tema oscuro no llegan a contraste AA y el campo de búsqueda móvil mide 21 px de alto. |
| Rendimiento | 3/4 | La carga observada es ágil, pero la portada mantiene animaciones de ventana completa y puede priorizar demasiadas imágenes. |
| Diseño responsive | 3/4 | No hubo desborde horizontal en las cuatro rutas móviles; quedan objetivos de toque pequeños. |
| Theming | 2/4 | El cambio claro/oscuro funciona y hay tokens, pero la combinación primaria del tema oscuro pierde contraste. |
| Integridad de implementación | 4/4 | El sistema pixelado es coherente, específico del producto y los hallazgos del detector son falsos positivos estéticos. |
| **Total** | **14/20** | **Bueno: corregir accesibilidad y costos de la portada antes de sumar más superficies comerciales.** |

## Corrección aplicada el 12/09

La tanda completa de este informe quedó implementada y publicada. Se conservó el mundo visual pixel-art y no se alteró contenido comercial ni el flujo de búsqueda.

| Hallazgo | Corrección verificada |
|---|---|
| Contraste de CTA oscuro | El rosa pasó a `#ff3377` con texto `#1a1a1a`: 4,97:1 contra tinta y 4,79:1 contra tarjeta oscura. |
| Objetivo de búsqueda móvil | El input mide 44 px a 390 px de viewport y usa 16 px en móvil para evitar zoom automático. |
| Estados de filtros | Acordeones y menú móvil relacionan control/panel; categorías y tiendas exponen `aria-pressed`; el error es una alerta. |
| Movimiento reducido | Se eliminó la anulación de transiciones de 0,01 ms. Las animaciones decorativas se detienen y el cambio de tema se aplica de inmediato. |
| Costo y CLS | Fondo y scanline dejan de repintar continuamente; las nubes se desplazan con `transform`; las imágenes ya no reciben prioridad masiva; el bloque patrocinado no se inserta cuando no hay sponsors. |

La ronda final en producción confirmó tema oscuro, contraste de tokens, menú y paneles asociados, campo de 44 px y ausencia de desborde a 390 px. Lint y TypeScript aprobaron; 10 tests focalizados y los 23 escenarios E2E de landings de categoría aprobaron. El detector volvió a señalar Inter, que permanece como falso positivo documentado.

## Evidencia y límites

- Portada: FMP aproximado de 1,05 s y DOMContentLoaded de 2,02 s en escritorio; en móvil, FMP de 0,15 s y DOMContentLoaded de 1,22 s. Búsqueda `ryzen`: FMP de 0,72 s y DOMContentLoaded de 3,87 s. Son muestras de DevTools, no LCP/INP/CLS de campo ni percentiles.
- No hubo desborde horizontal en portada, búsqueda, ficha ni contacto a 390 px. Las imágenes expuestas tenían texto alternativo y dimensiones reservadas.
- La primera pulsación de Tab en portada enfoca el enlace “Saltar al contenido principal”. Búsqueda, filtros y resultados exponen estados de carga mediante región viva.
- El cambio de tema actualiza correctamente `dark` y los colores de primer plano. El correo de contacto y las dos variantes `mailto` ya aparecen en producción.

## Veredicto de integridad

**Aprobado.** La UI conserva una identidad pixel-art consistente: bordes rectos, tipografía de píxel en jerarquías, tokens claro/oscuro y disclosure comercial explícito. El detector solo encontró el uso de Inter en `globals.css`; es un falso positivo para este producto porque se usa como fuente de lectura junto con `Press Start 2P`, no como sustituto genérico de la identidad visual.

## Hallazgos prioritarios

### P1 — Contraste insuficiente en CTA del tema oscuro

- **Ubicación:** `src/app/globals.css:276-292`, `src/app/globals.css:439-442`, `src/components/functional/SearchBar.tsx:101-114`.
- **Impacto:** `#ff0055` sobre blanco tiene contraste aproximado 3,90:1 y `text-primary` sobre la tarjeta oscura queda cerca de 4,30:1. Textos pequeños de botones, etiquetas y enlaces pueden no alcanzar WCAG AA.
- **Estándar:** WCAG 2.1, criterio 1.4.3 (contraste mínimo).
- **Recomendación:** oscurecer el rosa cuando lleve texto blanco o usar primer plano oscuro en CTA rosa, validando los estados hover, focus y disabled en ambos temas.
- **Comando sugerido:** `$impeccable colorize`.

### P1 — Campo de búsqueda demasiado bajo en móvil

- **Ubicación:** `src/components/functional/SearchBar.tsx:78-100`.
- **Impacto:** a 390 px el `<input>` mide 21 px de alto. El contenedor es grande, pero tocar específicamente el campo exige precisión innecesaria.
- **Estándar:** WCAG 2.2, criterio 2.5.8 (tamaño mínimo de objetivo).
- **Recomendación:** darle al input una altura mínima de 44 px o hacer que el área visible completa enfoque el campo sin perder el borde y la composición actual.
- **Comando sugerido:** `$impeccable adapt`.

### P2 — Estados de filtros incompletos para lectores de pantalla

- **Ubicación:** `src/components/functional/Filters.tsx:119-124`, `137-148`, `167-178`, `197-207`, `249-262`; `src/components/search/SearchPageView.tsx:184-191`.
- **Impacto:** los controles de acordeón y selección cambian visualmente, pero no anuncian `aria-expanded`, `aria-controls` o `aria-pressed`. Una persona con lector de pantalla no recibe el mismo estado que quien ve `[X]`.
- **Estándar:** WCAG 4.1.2 (nombre, función y valor).
- **Recomendación:** enlazar cada acordeón con su panel y exponer selección como botón presionado; conservar el contador visual actual.
- **Comando sugerido:** `$impeccable harden`.

### P2 — La alternativa de movimiento reducido elimina feedback útil

- **Ubicación:** `src/app/globals.css:511-550`, `src/components/layout/Navigation.tsx:67-84`.
- **Impacto:** la regla global de `0.01ms` también suprime transiciones de estado y el cambio de tema aún espera los temporizadores del wipe. La reducción de movimiento debería conservar una respuesta inmediata y clara.
- **Estándar:** WCAG 2.3.3 (animación por interacción) y preferencia del sistema.
- **Recomendación:** reemplazar la anulación global por reglas para animaciones decorativas y activar el tema de forma inmediata cuando se solicita movimiento reducido.
- **Comando sugerido:** `$impeccable animate`.

### P2 — Costo potencial de la portada en escritorio

- **Ubicación:** `src/app/globals.css:317-367`, `683-764`; `src/components/functional/ProductCard.tsx:43`; `src/components/home/HomePageClient.tsx:17-20`.
- **Impacto:** el fondo, scanlines y nubes animan la ventana de forma permanente en escritorio. Además, cada grilla puede marcar cuatro imágenes como prioritarias, y el bloque patrocinado usa un placeholder `h-32` que podría provocar CLS si luego crece.
- **Recomendación:** medir LCP/INP/CLS en Lighthouse y Web Vitals reales; limitar prioridad de imagen a la grilla hero visible, reservar la altura realista del bloque patrocinado y simplificar efectos si el perfil de bajo rendimiento lo necesita.
- **Comando sugerido:** `$impeccable optimize`.

### P2 — Errores de búsqueda y scroll no respetan completamente preferencias

- **Ubicación:** `src/components/search/SearchPageView.tsx:251-259`, `280-283`.
- **Impacto:** un error de búsqueda no se anuncia como alerta; la paginación fuerza `scrollIntoView({ behavior: 'smooth' })` incluso con movimiento reducido.
- **Recomendación:** usar `role="alert"` para el error y elegir scroll instantáneo cuando `prefers-reduced-motion` está activo.
- **Comando sugerido:** `$impeccable harden`.

### P3 — Asociación adicional del menú móvil

- **Ubicación:** `src/components/layout/Navigation.tsx:181-193`.
- **Impacto:** el botón ya declara `aria-expanded`, pero no `aria-controls`; los iconos de sesión podrían marcarse explícitamente decorativos.
- **Recomendación:** añadir el identificador del panel, `aria-controls` y `aria-hidden` en iconos no informativos.
- **Comando sugerido:** `$impeccable harden`.

## Hallazgos positivos que se mantienen

- El menú móvil tiene etiqueta y estado expandido; el sitio tiene landmarks, jerarquía de encabezados, enlace de salto y enlaces externos seguros.
- Las imágenes usan `alt`, dimensiones, carga diferida, decodificación asíncrona y fallback. El uso de `<img>` directo es deliberado para no fallar en el optimizador con proveedores externos.
- Las animaciones pesadas se desactivan en móvil y existe una preferencia para reducir movimiento.
- Los tokens cubren tema claro y oscuro y se validó que el cambio de tema actualiza la clase y el color de texto.
- Las cuatro rutas inspeccionadas mantienen el ancho del viewport móvil sin scroll horizontal.

## Orden recomendado

1. **P1 — `$impeccable colorize`:** corregir contraste de los CTA rosa/blanco del tema oscuro.
2. **P1 — `$impeccable adapt`:** ampliar el objetivo real del buscador en móvil.
3. **P2 — `$impeccable harden`:** completar estados de filtros, errores de búsqueda y semántica del menú.
4. **P2 — `$impeccable animate`:** reemplazar la reducción global de duración por alternativas con feedback inmediato.
5. **P2 — `$impeccable optimize`:** medir Web Vitals de campo y ajustar prioridades, placeholder patrocinado y efectos de escritorio.
6. **P3 — `$impeccable polish`:** confirmar foco, contraste y responsive después de los arreglos.
