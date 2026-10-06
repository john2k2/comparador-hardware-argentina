# Unidad 3: mínimo reciente coherente y referencias conservadas

PriceSummary y StoresList usan el mismo criterio: precio positivo, stock informado, URL e identidad aptas y observación de hasta 24 horas. Se elige una oferta por tienda antes del control de outliers; los precios anteriores o pendientes no alteran el mínimo, el orden ni el rango recientes. Las referencias conservan precio, stock, variante y fecha.

El detalle recibe un reloj inicial del servidor para hidratar consistentemente. Un temporizador al próximo vencimiento y los eventos de foco/visibilidad cambian la presentación sin relevar tiendas ni renovar timestamps. Las cuotas pertenecen a la oferta destacada actual.

Verificación focalizada: `npx vitest run src/lib/product/offer-presentation.test.ts src/components/product/OfferIdentityDisplay.test.ts src/lib/product/unavailable-offer-summary.test.ts --reporter=dot`: 37 pruebas aprobadas en tres suites.

Runtime: `confidence-first-delivery.spec.ts` compara destacado/lista/rango, referencias más bajas, vencimiento a los 24 h con fechas intactas y cero requests nuevos, y móvil sin desborde. El detalle completo y armador integrados también aprobaron. Una CPU real mostró tres ofertas recientes y nueve referencias; una GPU real sin ofertas recientes no mostró un mínimo antiguo. Es un corte, no una comprobación de compra en las tiendas.

Rollback: retirar offer-presentation y su uso en resumen/lista/hook; revertir el reloj y initialNow en detalle/page, las regresiones y las etiquetas E2E asociadas. No requiere revertir navegación, selección, scrapers o persistencia.

Se conserva la ventana de tres horas de guías/armador y el máximo exacto del presupuesto personalizado.
