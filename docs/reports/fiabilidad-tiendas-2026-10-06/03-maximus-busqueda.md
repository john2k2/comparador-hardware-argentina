# Resultados reales de búsqueda Maximus

La fuente devuelve sugerencias con `match=0` junto a coincidencias. Atribuirlas a la categoría consultada puede introducir monitores o teclados como procesadores. Ahora se excluyen esas sugerencias. El importe ARS mantiene centavos y rechaza moneda extranjera, negativos y cuotas.

Verificación: `npx vitest run src/lib/scrapers/maximus.test.ts`: 15 aprobadas, con transporte simulado y fixture de sugerencias. Runtime: la lectura exacta Maximus se acredita en la unidad siguiente; esta prueba de búsqueda no certifica stock y conserva `unknown`.

Reversión: `maximus.ts` y sus pruebas. No cambia base, referencias guardadas, identidad aprobada o credenciales.
