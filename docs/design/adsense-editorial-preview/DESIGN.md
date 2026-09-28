---
name: Maqueta local de anuncios editoriales
description: Espacio editorial local para comprobar ubicación y medidas sin cargar publicidad real.
colors:
  foreground: "var(--foreground)"
  muted: "var(--muted)"
  border: "var(--border)"
typography:
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.75rem"
    lineHeight: "1rem"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "0.875rem"
    lineHeight: "1.25rem"
rounded:
  none: "0px"
spacing:
  label-to-slot: "0.5rem"
  block-y: "2.5rem"
components:
  editorial-ad-slot:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "0 1.5rem"
    width: "300px"
    height: "250px"
---

# Design System: Maqueta local de anuncios editoriales

## Overview

**Creative North Star: "Un espacio de prueba honesto dentro del mundo pixel"**

Este componente conserva el lenguaje retro pixel existente del sitio mientras resuelve una necesidad estrecha: comprobar que un espacio editorial de anuncios cabe y queda ubicado en contenido listo. La maqueta tiene una presencia deliberadamente contenida: etiqueta textual, bloque de medidas fijas y señales de borde/fondo ya provistas por el tema.

Su contrato es local y reversible. No representa una entrega publicitaria, no incorpora proveedor, enlaces, animaciones, `ins`, scripts ni consentimiento, y no convierte una variable de entorno en publicidad de producción.

**Key Characteristics:**

- Bloque único de 300×250 px con etiqueta "Publicidad".
- Tipografía Inter para texto auxiliar y contenido de la maqueta.
- Radio cero, borde discontinuo y fondo `muted`, en continuidad con la interfaz pixel.
- Renderizado solo en desarrollo, con contenido editorial listo y habilitación explícita.

## Colors

La maqueta toma sus colores del tema existente para no introducir una paleta de anuncios separada: texto foreground, superficie muted y borde border.

### Neutral

- **Texto del tema** (`var(--foreground)`): etiqueta y copia explicativa del espacio.
- **Superficie muted del tema** (`var(--muted)`): relleno del bloque de prueba.
- **Borde del tema** (`var(--border)`): borde discontinuo del bloque.

### Named Rules

**The Theme-Bound Preview Rule.** El bloque usa los roles cromáticos existentes (`foreground`, `muted`, `border`) y no inventa colores de proveedor ni una identidad comercial de anuncios.

## Typography

**Body Font:** Inter (with ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)

**Label/Mono Font:** La etiqueta usa la misma familia de cuerpo; el componente aplica `text-xs` y el mensaje del bloque `text-sm`.

**Character:** Texto de interfaz compacto y legible, subordinado al contenido editorial circundante.

### Hierarchy

- **Body** (regular, `0.875rem`, `1.25rem`): mensaje dentro del espacio 300×250.
- **Label** (regular, `0.75rem`, `1rem`): etiqueta `Publicidad` sobre el bloque.

### Named Rules

**The Auxiliary-Text Rule.** La tipografía del componente describe el espacio; no se usa para simular una creatividad, una llamada comercial ni un anuncio servido.

## Layout

El componente se integra después de la metodología editorial en `src/app/guia/[slug]/page.tsx` y `src/app/comparativa/[slug]/page.tsx`. El wrapper usa un container query: el bloque se mantiene oculto por debajo de 300 px de ancho disponible y pasa a una columna centrada desde `@[300px]`. El grupo aplica separación vertical `my-10` y `gap-2` entre etiqueta y bloque.

Las rutas habilitadas son exactamente `/guia/pc-gamer-2-millones`, `/comparativa/ryzen-5-7600x-vs-ryzen-7-5700x` y `/comparativa/rtx-4060-vs-rx-7600`. La maqueta requiere `contentReady`; en la guía esto además exige que los slots de contenido estén en stock.

**The Fixed-Slot Rule.** El espacio visual conserva 300×250 px (`ADSENSE_EDITORIAL_PILOT.width` y `.height`) para que la prueba mida el formato solicitado, incluso cuando no haya proveedor.

## Elevation & Depth

El componente es plano. No agrega sombra, transformación ni animación: el borde discontinuo y el cambio tonal entre la superficie del bloque y el contexto son suficientes para identificar el área de prueba.

### Named Rules

**The Quiet-Surface Rule.** Una maqueta local se reconoce por su estructura y copy explícitos, no por efectos que parezcan una entrega publicitaria.

## Shapes

La silueta es rectangular y de radio cero (`0px`), alineada con la regla pixel-art vigente. El bloque usa un borde `1px dashed` del token `border`; no hay esquinas redondeadas, recortes ni sombras.

## Components

### Editorial preview slot

Es un bloque de verificación de espacio, no una unidad publicitaria activa.

- **Forma:** rectángulo de radio cero, centrado en su columna.
- **Superficie:** `muted`; texto `foreground`.
- **Medidas:** 300×250 px.
- **Contenido:** etiqueta accesible `aria-label="Publicidad"` y el texto `Vista previa del espacio de anuncios. No se cargan anuncios reales.`
- **Borde:** `1px dashed border` del tema.
- **Visibilidad:** solo con `NODE_ENV=development`, `ADSENSE_PREVIEW=1`, `contentReady=true` y pathname permitido; además requiere al menos 300 px de container query.
- **Integración:** aparece tras `EditorialMethodology` en las dos familias de páginas indicadas.

## Do's and Don'ts

### Do:

- **Do** conservar el formato de 300×250 y la etiqueta `Publicidad` cuando se pruebe este espacio.
- **Do** mantener el bloque atado al tema (`foreground`, `muted`, `border`) y a la tipografía de cuerpo existente.
- **Do** comprobar las tres rutas permitidas, el estado de contenido listo y el umbral de container query.
- **Do** tratar la maqueta como evidencia de layout local: las capturas son `espacio-local-1280.png` y `espacio-local-390.png`.

### Don't:

- **Don't** registrar este bloque como monetización activada, entrega de anuncios o integración de AdSense.
- **Don't** añadir `ins`, scripts, enlaces, proveedor, animaciones o lógica de consentimiento al componente de preview.
- **Don't** mostrarlo en producción: `canPreviewEditorialAd` devuelve `false` aunque `ADSENSE_PREVIEW=1` esté presente.
- **Don't** forzar overflow en containers menores de 300 px; la regla observada oculta el bloque.

## Evidence

La revisión shipped local quedó registrada en `docs/reports/crecimiento-2026-09-12/cortes/2026-09-27/adsense-preparation/`. `ESPACIO-LOCAL.json` mide el slot en el orden de las tres rutas (300, 300 y 0 px) y reporta 200, sin `ins`, scripts ni overflow; `PRODUCCION-LOCAL.json` reporta las tres rutas con 200 y preview oculto en 1280, 390 y 320 px. Las capturas disponibles son de 1280×900 y 390×900. La disposición del reviewer fue `adsense_slot_finish: ship`, `material_fixes: []`, limitada al componente.
