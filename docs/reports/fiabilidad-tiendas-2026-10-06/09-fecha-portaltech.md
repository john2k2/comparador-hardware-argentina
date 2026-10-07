# Conservar la fecha real al reutilizar PortalTech

La caché de render almacena HTML y fecha de su observación. Releer ese HTML a los cinco minutos conserva esa fecha; sólo otro render real la cambia. El vencimiento se calcula al completar el render. Un error posterior no renueva la oferta.

Verificación: `npx vitest run src/lib/scrapers/portaltech.test.ts`: 14 aprobadas con reloj/transporte simulados y aislamiento de caché por test. Escenarios de primera lectura, reutilización, vencimiento y fallo. Runtime Cloudflare render: N/A en esta entrega; no se usaron token/cuenta de render ni se probó ese servicio real. El GET público sin credenciales figura como no-observación y no cierra la fuente.

Reversión: `portaltech.ts` y sus regresiones. No cambia credenciales, TTL, stock, identidad ni registros de base.
