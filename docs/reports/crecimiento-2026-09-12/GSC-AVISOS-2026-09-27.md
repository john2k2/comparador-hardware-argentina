# Avisos GSC y feedback autenticado — 27/09/2026, 15:09 UTC

La revisión se realizó desde Chrome, con la sesión iniciada que Jonathan indicó. La bandeja del control diario de la mañana no se había revisado; el seguimiento se amplió para comprobar mensajes nuevos diariamente, además de las métricas semanales. Las limitaciones anteriores de Facebook correspondían al fetch público y al correo, no a la sesión de Chrome. Jonathan autorizó usar Chrome para estas comprobaciones en pestañas de revisión independientes.

## Search Console

| Aviso | Evidencia actual | Conclusión limitada |
|---|---|---|
| 27/09: falta `offers`, `review` o `aggregateRating` en fragmentos de productos | Informe actualizado el 25/09, primera detección 23/09, tres elementos afectados. Fuente Arkham rastreada 24/09; SSD SanDisk y RAM Aimerican rastreados 23/09. | Los rastreos mostrados preceden al arreglo publicado el 25/09. No prueba una regresión posterior. |
| 25/09: validación de `hasMerchantReturnPolicy` | Advertencia no crítica; estado «tiene buena pinta», inicio 25/09. Detalle: 2 pendientes, 0 correctos, 0 errores, 3 otros. | Sigue en curso, no está aprobada. El comparador no debe inventar una política propia para comercios externos. |

Se comprobaron las tres URLs públicas señaladas por el aviso del 27/09: todas respondieron 200 y su JSON-LD incluyó organización y breadcrumbs, **sin `Product` incompleto**:

- `agrupado-fuentes-alimentacion-650w-80-arkham-by-coreshield-fuente-gold-plus-xp-drwxhd`
- `agrupado-almacenamiento-1tb-copious-disco-solido-ssd-ylyls4`
- `agrupado-memoria-ram-16gb-5600mhz-aimerican-ddr5-telepathy-glhpma`

El arreglo público está comprobado para estas tres fichas, pero Google todavía no muestra un rastreo posterior ni una validación superada. No se inició ninguna validación ni se solicitó indexación. El problema limita la elegibilidad del marcado para resultados enriquecidos; no demuestra que las páginas estén fuera del índice. [Documentación de Google sobre fragmentos de producto](https://developers.google.com/search/docs/appearance/structured-data/product-snippet).

## Feedback del grupo

En la [publicación](https://www.facebook.com/groups/1482312995375273/posts/4520421824897693/) se verificaron **dos comentarios** con «Todos los comentarios» seleccionado y **tres reacciones**. Se conserva síntesis sin nombres, teléfonos ni datos personales:

| Fuente | Síntesis | Próxima evaluación |
|---|---|---|
| Comentario `4520428151563727`, 25/09 | Valoración positiva de la idea y propuesta de enlaces a listas QVL de motherboards para consultar compatibilidad de memorias | Asociar al trabajo de compatibilidad/contenido G10; evaluar enlaces oficiales por modelo, sin anunciar compatibilidad garantizada ni implementar desde este corte. |
| Comentario `4521098784829997`, 26/09 | Persona que se presenta como representante de `scorpiopc.com` solicita incluir su tienda | Candidato para revisión de catálogo/prospectos G16/G13; identidad, sitio, stock, condiciones y acceso todavía no verificados. No es un sponsor confirmado ni un lead pagado. |

No se respondió, publicó ni contactó a nadie. No se atribuyen visitas, consultas o ventas a estas reacciones/comentarios. Los cortes anteriores con feedback no verificado quedan superados únicamente por esta lectura autenticada fechada.

## Qué significa «sin cobertura reciente»

En el artefacto del cron del 27/09, a las 10:30 UTC, las tres GPU de la muestra sumaban 0/27 ofertas observadas en ≤24 h y las tres RAM 0/12. Es un dato de **observación de precios almacenados en la muestra fija**, no de indexación, caída del sitio, stock actual de la tienda ni de todas las ofertas de esas categorías. El cron consultó otra vez `procesadores`, por lo que su éxito no demuestra cobertura de GPU/RAM. G02 sigue abierto (2/7 ciclos útiles y frescura insuficiente).

Nota de publicación: las capturas y archivos de cortes se conservan localmente; no se incluyen en el repositorio público porque pueden contener datos de sesiones o conversaciones. Los enlaces a cortes son referencias de evidencia local.
