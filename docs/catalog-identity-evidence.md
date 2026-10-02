# Identidad ligada a evidencia

Un dictamen se liga a producto, categoría, URL y fuente observada: título, referencia, ID público y SKU local. Un cambio material invalida el dictamen previo. JSON inválido queda en revisión, sin convertirse en aprobación ni romper lecturas.

La prueba `exact-attributes` sólo acepta atributos completos y exactamente iguales. No usa un score inventado: CPU conserva modelo/sufijos/presentación; GPU chip/fabricante/serie/memoria/ediciones; RAM exige forma, kit, CL y color. Ausencias quedan para corroboración. Contradicciones explícitas se rechazan aunque una revisión antigua haya sido positiva. SQL y TypeScript recomputan la prueba al leer.

Jev mantiene el umbral 0,8 para las ambigüedades. El contexto excluye URLs completas/datos privados y no decide precio, stock ni compatibilidad. Su caché se liga a la evidencia y versión de contrato; renovar un dictamen no renueva la fecha de precio. El contador G02 aceptado comprueba el mismo contrato, conservando los contadores históricos con su significado anterior.

Validación: pruebas `offer-identity`, `offer-attribute-proof`, `g02-sample-evidence` y SQL `current_offer_evidence`. Rollback: consumidor previo y migración forward para helpers si fuera necesario; conservar evidencia y abstenciones. No bajar umbrales, eliminar ofertas ni cambiar nueve IDs para mejorar tasas.
