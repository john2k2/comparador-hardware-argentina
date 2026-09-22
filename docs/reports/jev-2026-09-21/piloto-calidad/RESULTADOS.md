# Piloto de calidad: Jev como revisor de ofertas

Evaluación: 21/09/2026. Captura del catálogo: 23:12 UTC, 20:12 en Santiago.

**Recomendación: usar Jev como segunda revisión de identidad y variantes, junto con reglas y corroboración en fuentes.** La prueba aporta evidencia de utilidad para detectar inconsistencias; todavía no mide una mejora general de precisión ni habilita decisiones automáticas sobre el catálogo público.

La etapa exploratoria está ejecutada: 50 ofertas capturadas, 16 evaluadas por Jev y cuatro lecturas puntuales de páginas de tiendas. La verificación completa de las 50 ofertas queda pendiente. El código funciona como piloto local; no se integró al sitio ni se modificó la base de datos.

## Muestra y método

- Se consultaron las búsquedas públicas `rtx 4060`, `ryzen 5600` y `ddr5 32gb`. Las tres respondieron HTTP 200 y `DB-STALE`.
- Se tomaron 50 ofertas, intercalando las búsquedas y evitando repetir la misma combinación producto/tienda/URL. Son ofertas, no 50 productos diferentes. La selección usa la primera página y no es aleatoria.
- Entre ellas se eligieron 16 casos para cubrir coincidencias, contradicciones y ambigüedad. Un asistente hizo una revisión textual sin ver respuestas de Jev: seis coherentes, siete contradictorios y tres inciertos. Esta revisión no es validación humana ni comprobación de SKU en la tienda.
- Jev recibió solamente categoría, nombre y URL públicos, con tres opciones explícitas: coherente, conflicto o evidencia insuficiente. No recibió las etiquetas de revisión, precios, credenciales ni conversaciones.
- Se ejecutaron dos lotes de ocho preguntas con `jev-1.13.0`. Uso total informado: 6.723 tokens de entrada y 758 de salida.
- La referencia determinística usa las funciones actuales de identidad y precios del proyecto. La igualdad de claves es un control acotado; no representa por sí sola todo el agrupado o ranking de producción.

Los datos y las preguntas exactas están en `catalog-sample.json`, `text-review.json`, `jev-requests.json` y `jev-runs.json`, en esta carpeta.

## Qué detectó Jev

| Casos seleccionados | Respuesta de Jev | Lectura del resultado |
|---|---|---|
| 7 contradicciones textuales | Señaló conflicto en las 7 | Detecta diferencias relevantes de chip, familia, frecuencia o latencia |
| 6 coincidencias textuales | Eligió coherente en las 6 | Una de ellas obtuvo confianza baja |
| 3 casos inciertos | Eligió coherente en 2 y conflicto en 1 | Faltó abstenerse; los tres tuvieron confianza baja |

Hubo 13 coincidencias con las 16 etiquetas previas. **Ese conteo no es una tasa de precisión general:** la muestra es pequeña, seleccionada y revisada por otro asistente. Tampoco prueba que las fichas de destino sigan describiendo lo que dice su URL.

En seis de los siete conflictos textuales, la función actual `extractExactModelIdentity` devolvió la misma clave para el nombre y la URL:

| Oferta | Contradicción textual |
|---|---|
| `offer_03` | Patriot Viper Venom CL30 frente a CL36; la URL agrega BULK OUTLET |
| `offer_09` | Viper Venom 6000 MHz frente a Viper Elite 5 5600 MHz |
| `offer_15` | Viper Venom 6000 MHz frente a Viper Xtreme 5 7000 MHz |
| `offer_18` | Adata 5600 MHz frente a 4800 MHz |
| `offer_30` | Predator Vesta II 6000 MHz frente a Lexar 5600 MHz |
| `offer_42` | Corsair Vengeance CL36 frente a CL38 |

Hay causas corregibles con reglas: la clave RAM no incluye CL; su reconocimiento de velocidad depende de límites de palabra que no cubren `6000MHz`, y su catálogo de velocidades y familias es incompleto. Jev puede señalar estas inconsistencias, pero mejorar las reglas también puede resolverlas. Esta prueba no compara Jev contra una versión corregida de esas reglas.

El séptimo conflicto, `offer_01`, enfrenta RTX 4060 con RTX 5060 y ya se detecta de forma determinística. La ficha de XT-PC se había comprobado en la evaluación inicial de esta tarea.

## Corroboración con fuentes

Se hicieron cuatro lecturas HTTP, registradas en `source-checks.json`:

| Oferta | Evidencia consultada | Conclusión permitida |
|---|---|---|
| `offer_29`, Ryzen 5 5600 en Maximus | El catálogo indicaba disponible; la ficha respondió 200 con encabezado “Artículo sin stock” y descripción coincidente | Hay una contradicción de disponibilidad con el dato guardado; no debería recomendarse como disponible sin actualizar |
| `offer_24`, Adata 32 GB 5600 en SCP | La ficha y encabezado confirman marca, capacidad y frecuencia; el fragmento principal incluye SKU de tienda MEM709 | Sigue faltando evidencia suficiente sobre Premier, CL46 y código exacto; la respuesta coherente de Jev fue demasiado concluyente |
| `offer_03`, Patriot en CompraGamer | HTTP 200 con aplicación inicial, sin nombre de producto ni datos estructurados útiles en el HTML recibido | La contradicción está en el texto guardado y la URL; la ficha viva no quedó corroborada |
| `offer_42`, Corsair en CompraGamer | Mismo resultado de aplicación inicial | Requiere otra vía de lectura de la ficha antes de corregir la asociación |

Jev marcó conflicto en `offer_29` por la diferencia entre 3,5 y 4,4 GHz. La [ficha oficial de AMD Ryzen 5 5600](https://www.amd.com/es/support/downloads/drivers.html/processors/ryzen/ryzen-5000-series/amd-ryzen-5-5600.html) confirma 3,5 GHz de base y hasta 4,4 GHz de turbo: esa diferencia por sí sola no demuestra otro modelo. Es un ejemplo concreto de por qué el contexto técnico y la fuente deben resolver las dudas del modelo. No se comprobó checkout de ninguna tienda.

## Política local de calidad

El piloto combina controles independientes:

1. Precio positivo y numérico, URL HTTP/HTTPS sin credenciales y contradicciones explícitas de chip.
2. Fecha de cada oferta, sin sustituirla por la fecha del producto. Para esta exploración se eligió una vigencia máxima de 24 horas; no es una promesa de actualización del sitio.
3. Stock conocido y disponible. Los estados desconocido o agotado requieren revisión.
4. Relación de identidad y juicio de Jev cuando existe. Una discrepancia del modelo propone corroboración; no borra ni reasigna productos.
5. Respuestas malformadas, inciertas o de confianza inferior a 0,8 requieren revisión. **El umbral 0,8 se agregó después de observar estas respuestas, no está calibrado y debe evaluarse con casos nuevos.** No equivale a 80 % de probabilidad de acierto.

Cuatro de las 16 respuestas quedan bajo ese umbral: `offer_02`, `offer_04`, `offer_24` y `offer_29`. Esto incluye los tres desacuerdos y una coincidencia textual. La abstención tiene un costo de cobertura que también hay que medir.

En las 50 ofertas, el filtro individual actual de stock/precio admitiría 33, incluidas cuatro con stock desconocido. Las 50 tienen fecha de oferta anterior al umbral exploratorio de 24 horas. La política local separa una asociación por conflicto explícito de chip y manda las otras 49 a corroborar. Ninguna se marca verificada.

Ese resultado final es igual con y sin Jev, porque la antigüedad ya obliga a revisar todas. El aporte observado de Jev está en los motivos de revisión de identidad; **no se demostró una mejora de decisiones finales de publicación en esta muestra**. El estado de frescura fue la limitación dominante.

## Aplicación al producto

- **Mostrar:** enseñar fecha y condiciones por oferta, y distinguir disponible verificado de pendiente de corroboración. Una respuesta de Jev no puede renovar un precio.
- **Corroborar:** usar sus señales para priorizar lecturas de fichas y revisar variantes; resolver con SKU, fabricante y datos concretos de la tienda.
- **Comparar:** agrupar únicamente variantes y condiciones equivalentes. Una oferta outlet, un CL distinto o una generación diferente no deben competir como si fueran el mismo artículo.
- **Armar presupuestos:** primero validar piezas necesarias, compatibilidad, modalidad de pago, disponibilidad y sumas mediante reglas. Jev puede evaluar alternativas válidas según el uso declarado. Esta capacidad no se probó en esta etapa.
- **Actualizar a pedido:** volver a consultar las ofertas elegidas y mostrar la hora de cada comprobación. Agregar Jev no convierte el cron diario en una actualización en tiempo real.

Antes de activar decisiones públicas: corregir las reglas conocidas, reunir fichas con evidencia suficiente y ejecutar una evaluación separada cuyos casos no se hayan usado para ajustar el prompt o el umbral. Comparar reglas corregidas frente a reglas más Jev, con revisión humana de discrepancias, cobertura y errores por tipo. No hay un umbral de despliegue validado todavía.

## Código y verificación

El piloto está en `scripts/pilots/catalog-quality.mjs`; las pruebas, en `scripts/pilots/catalog-quality.test.mjs`. Lee archivos locales, usa funciones de identidad/precio del proyecto y escribe un resultado. No hace llamadas a Jev ni a la base de datos por sí mismo. Las respuestas reales de Jev están conservadas para repetir el análisis sin más consumo.

Desde la raíz del proyecto, con Node 22.18 o superior y las dependencias instaladas:

```bash
node scripts/pilots/catalog-quality.mjs \
  docs/reports/jev-2026-09-21/piloto-calidad/catalog-sample.json \
  /tmp/comparador-jev-quality-replay.json \
  docs/reports/jev-2026-09-21/piloto-calidad/jev-answers.json

node --test scripts/pilots/catalog-quality.test.mjs
```

Verificación ejecutada con Node 26.5.0: **9 pruebas pasadas y lint sin errores**. Las pruebas cubren precio/URL inválidos, fechas antiguas o futuras, stock desconocido, contradicción de chip, respuestas malformadas y confianza baja. No se corrió un nuevo build del sitio porque no hay cambios de aplicación. El hash del script y los conteos reproducibles están en `evaluation-metrics.json`.
