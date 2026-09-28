# Preparación del cargador publicitario — 28/09/2026

## Alcance observado

Se preparan módulos sin conexión a páginas, layout ni proxy. `enabled` y las verificaciones de aprobación Google, privacidad, navegación y anuncios automáticos permanecen en `false`; no hay páginas aprobadas editorialmente en la configuración. El contexto real no puede cargar Google. No se cambian la CSP pública, la política visible, las preferencias GA4 ni el estado G23 del tablero. Esto es preparación parcial, no aprobación de AdSense ni prueba de una CMP real.

## Controles preparados

- Configuración del servidor: tres rutas exactas, contenido disponible, nonce de 32 caracteres hexadecimales y todas las verificaciones positivas. No se habilita mediante una variable de maqueta, query string, consentimiento GA4 o recomendación de Jev.
- Documento: perfil CSP y ruta coincidentes, nonce real del documento, espacio conectado de al menos 300 px. Esas marcas aún no se emiten desde el layout público. No se pisan una cola publicitaria preexistente ni otro cargador del documento.
- Carga: solo tras permiso explícito del visitante para cargar Google; cola pausada y anuncios no personalizados desde el inicio. Ese permiso no reemplaza el consentimiento regional de una CMP certificada. Una etiqueta pausada puede cargar otros scripts y leer cookies existentes; no se presenta como ausencia de comunicación con Google. [Comportamiento oficial de pausa](https://support.google.com/adsense/answer/7670312?hl=en-GB_ALL).
- Solicitud: espera tanto el script como las señales regionales. GDPR necesita una decisión de la CMP, Google divulgado y consentido, propósito 1 y bases compatibles para 2/7/9/10, respetando restricciones del editor. El filtro no decodifica ni certifica el TC string completo: eso permanece en Google/CMP. TCF API usa versión entera 2. [Requisitos Google](https://support.google.com/adsense/answer/9804260?hl=en), [API IAB](https://github.com/InteractiveAdvertisingBureau/GDPR-Transparency-and-Consent-Framework/blob/master/TCFv2/IAB%20Tech%20Lab%20-%20CMP%20API%20v2.md).
- Alcance inicial: no pide anuncios cuando las señales US indican un estado regulado aplicable, independientemente de su opt-out; tampoco con Global Privacy Control activo. No se interpreta el estado inicial de US como permiso para cualquier territorio. Ampliar ese alcance requiere señales GPP completas y revisión nueva. [API Google Privacy & Messaging](https://developers.google.com/funding-choices/fc-api-docs).
- Fallos: ninguna solicitud si faltan APIs o señales, falla la carga, cambian la ruta o el ancho, se desconecta el espacio o vence la espera técnica. Si la CMP está visible y el resto está listo, se permite al visitante leerla sin el límite técnico de 15 segundos.
- Retiro: pausa, limpia el espacio y elimina el listener capturado. No hay otra impresión en ese documento ni reactivación desde callbacks tardíos. Abrir preferencias cierra primero el espacio. La etiqueta ya cargada no se puede descargar retirando el nodo: falta integrar y probar la navegación mediante documento nuevo.

## CSP candidata y pendientes de integración

El helper aislado reproduce el enfoque de nonce/strict-dynamic documentado por Google, conserva restricciones de marcos entrantes, formularios y base URI y rechaza nonce no válido. Su política permite más recursos y scripts descendientes que la actual. No se aplica al sitio ni se considera equivalente a su CSP actual. Antes de usarla se requieren prueba de recursos, revisión de seguridad y límites entre documentos públicos y privados. [CSP admitida por AdSense](https://support.google.com/adsense/answer/16283098?hl=en-GB).

Faltan componente/controles visibles, integración condicional del documento y CSP, navegación completa, revisión de privacidad y verificación de anuncios automáticos desactivados. Las pruebas con Google real y la retirada regional se conservan para G25, después de aprobación, antes de servir el piloto. No se cierra G21/G23/G24 a partir de estos módulos.

## Verificación y reversión

Pruebas locales de reglas y configuración: 54 aprobadas, sin red ni Google real. Incluyen contexto real cerrado, cada requisito faltante, rutas ajenas, nonce no válido, rechazo de propósito/Google, restricciones de CMP y estados US. Runtime: 21 pruebas aprobadas con fixture DOM/Window, incluidas cola preexistente, propietario activo sin interferencia, carga única, distintas secuencias de callbacks, ausencia/error de proveedor, espera visible de CMP, retirada y cambio de ruta/ancho. Las 18 pruebas de identidad/Jev se verifican por separado para su unidad de diagnóstico.

`npm test -- src/lib/adsense src/lib/ai/review-product-offers.test.ts src/lib/ai/jev-client.test.ts`: 91 aprobadas antes de los dos casos finales; `npm test -- src/lib/adsense/provider-runtime.test.ts`: 21 aprobadas después. Total por unidades: 93. ESLint y TypeScript aprobados; build Next finaliza con 51 páginas. Durante la generación hubo seis lecturas de categoría con `fetch failed`, atendidas por el fallback existente. Ese build no demuestra disponibilidad de Supabase, cierre de G01 ni entrega real de anuncios/CMP.

División de revisión: autorización/señales/CSP con sus pruebas; runtime con su fixture de navegador; diagnóstico Jev separado. La unidad runtime tiene 637 líneas de código y pruebas, antes de documentación. Es el menor bloque completo preparado en esta división, mayor que la orientación de 400 líneas: conservar las pruebas con su comportamiento y recomendar revisión separada con excepción de tamaño si se abre PR. No se comprimió ni separó el fixture para ocultar el tamaño; no se abrió PR ni se presenta como excepción aprobada por el usuario.

Reversión independiente: retirar `consent-signals`, `csp-policy` y `provider-runtime` con sus pruebas, y restaurar `editorial-pilot` a la maqueta de desarrollo. No requiere modificar `ads.txt`, identidad de ofertas, scraping, cuenta Google, layout o proxy. Mantener `enabled: false` por sí solo no completa los controles pendientes.
