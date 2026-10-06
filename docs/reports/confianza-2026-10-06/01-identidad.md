# Unidad 1: notebooks abreviadas fuera de componentes

Las publicaciones que empiezan por NB/Not y una marca de notebook se reconocen como equipos completos. El buscador del comparador y los slots del armador no deben ofrecerlas como una GPU independiente. Se conservan los filtros existentes de accesorios y los modelos de GPU suelta.

Verificación focalizada: `npx vitest run src/lib/product-identity.test.ts src/lib/pc-builder/model.test.ts --reporter=dot`: 46 pruebas aprobadas en dos suites.

Verificación en navegador integrada: `npx playwright test --config=playwright.confianza.config.ts`, 24 recorridos aprobados; `component-identity.spec.ts` inyecta una notebook mal clasificada junto con una GPU y exige que sólo se ofrezca la GPU. La prueba no modifica el catálogo.

Rollback: retirar el reconocimiento NB/Not, su filtro en ProductComparisonBuilder y las regresiones asociadas. No requiere cambiar persistencia, scrapers, Worker ni los controles de variantes.

Límite: es una defensa de selección/presentación. No sanea registros históricos de la base de datos.
