# AdSense: política de scripts y consentimiento antes del piloto

Documento actualizado el 28/09/2026 a las 13:36 UTC. El control CSP citado corresponde a las 01:20 UTC, todavía 27/09 en Argentina y Chile. Segunda opinión Jev no disponible en las herramientas de esta sesión; no se atribuye a Jev la decisión. G23 continúa en revisión. No se cambió código, política pública, cuenta ni estado de anuncios.

## Comprobación de la política vigente

La lectura del proxy encontró nonce en un header interno para el render y CSP en la respuesta. La guía de Next.js muestra CSP tanto en request como en response para el nonce automático. Esa diferencia de implementación motivó una comprobación, no un diagnóstico de fallo. Fuente: [guía oficial de Next.js](https://nextjs.org/docs/app/guides/content-security-policy).

La comparativa `/comparativa/rtx-4060-vs-rx-7600` respondió 200 en fetch y Chrome aislado. Los cinco scripts inline ejecutables inspeccionados tienen el nonce de la misma respuesta, incluidos los dos del runtime de Next. No hubo scripts sin nonce o con nonce distinto, errores CSP ni eventos `securitypolicyviolation` durante la navegación y el rechazo de analítica. El botón respondió y persistió elección negativa; en 390×844 no hubo desbordamiento. Se bloquearon hosts de telemetría/publicidad para no enviar eventos de prueba.

Evidencia local privada: `cortes/2026-09-27/adsense-preparation/CSP-PUBLICO.json`. No contiene nonce, HTML, cookies ni credenciales. Alcance: una ruta y una carga; no demuestra todas las páginas, navegación cliente, solicitudes repetidas, futura integración del proveedor ni disponibilidad sostenida G01. El JSON-LD se excluyó del conteo de scripts ejecutables. La CSP pública actual se conserva; el runtime medido no justifica modificarla por una falla supuesta.

## Corrección del diseño previsto para AdSense

Google admite como integración CSP de AdSense el enfoque estricto con nonce, porque los dominios del código publicitario cambian. Su ejemplo incluye `strict-dynamic`, permite evaluación dinámica y advierte que políticas más restrictivas pueden romperse. Recomienda probar inicialmente en modo de reporte. Fuente: [guía oficial de AdSense y CSP](https://support.google.com/adsense/answer/16283098?hl=en-GB).

Esto reemplaza la propuesta anterior de cerrar G23 mediante una lista fija de orígenes observados. Observar hosts ayuda al diagnóstico, pero no convierte esa lista en una configuración soportada. Tampoco basta con añadir nonce al primer script: hoy `default-src`, `script-src-elem` y las restricciones de conexiones/frames afectan la cadena del proveedor.

No copiar automáticamente el ejemplo de Google a toda la web. Requiere valorar el cambio de confianza en scripts descendientes y los recursos externos autorizados. Next no necesita `unsafe-eval` en producción por defecto, según su documentación; AdSense es una dependencia distinta. Un modo de reporte adicional no anula la CSP aplicada, así que por sí solo no permite probar un cargador actualmente bloqueado.

| Alternativa concreta | Evidencia y consecuencia | Decisión en este corte |
|---|---|---|
| Mantener política actual y no cargar AdSense | Sitio y rechazo de GA4 funcionan en la muestra; no hay anuncios reales | Aplicada durante preparación; no cierra la integración |
| Añadir una lista de hosts encontrados en una prueba | Puede pasar esa ejecución; Google no ofrece estabilidad para esa estrategia | Descartada como criterio de cierre |
| Diseñar y probar integración con nonce según Google | Exige revisar las directivas y demostrar consentimiento/navegación antes de promover cambios | Próxima solución a evaluar; no aprobada ni implementada por este documento |
| Quitar CSP o relajarla globalmente sin pruebas | Amplía exposición del sitio y no demuestra privacidad ni calidad del piloto | Descartada |

La decisión se apoya en documentación primaria y runtime, con confianza alta en que la lista fija no es el mecanismo soportado. La compatibilidad de una futura política y su impacto permanecen sin verificar. No se declara la política actual insegura por no admitir anuncios todavía.

## Contrato de consentimiento que debe implementar el cargador

La CMP de Google puede llegar mediante la etiqueta AdSense. Esperar a que esa misma CMP ya esté lista antes de cargar la etiqueta puede bloquear el flujo. La API distingue disponibilidad de API de disponibilidad de elección; deben utilizarse eventos y estado de consentimiento aplicables, con resultado desconocido tratado como pendiente. El botón GA4 propio sigue controlando analítica por separado. Fuente: [API oficial de Privacy & Messaging](https://developers.google.com/funding-choices/fc-api-docs).

Pausar solicitudes de anuncios permite aplazar su solicitud, pero la etiqueta puede cargar otros scripts y leer cookies existentes. No describir ese estado como ausencia total de transmisión o procesamiento. Anuncios no personalizados tampoco equivalen automáticamente a ausencia de consentimiento necesario. Fuente: [comportamiento de las etiquetas de Google](https://support.google.com/adsense/answer/7670312?hl=en-GB_ALL).

Antes de incorporar el proveedor deben quedar definidos y medidos:

1. Entrada al piloto solo en las tres rutas exactas, con aprobación editorial real y contenido elegible; nunca en auth, admin, formularios ni estados vacíos. La maqueta actual no implementa estas autorizaciones para anuncios.
2. Carga única y sin solicitud publicitaria mientras el estado aplicable siga desconocido. Timeout, API fallida o bloqueador conservan el estado pendiente/rechazado; no conceden permiso por defecto.
3. Decisiones de aceptar, rechazar y gestionar entregadas por la CMP real, divulgación correspondiente y retiro funcional. No convertir aceptación GA4 en consentimiento publicitario.
4. Navegación de Next: una lista de rutas del componente no descarga scripts ya ejecutados ni cambia automáticamente la CSP del documento durante navegación cliente. Probar entrada, salida, recarga y cambio de preferencias; evaluar aislamiento o navegación completa antes de afirmar que la política está limitada por ruta.
5. Rechazo/retirada con estado de anuncios medido, sin activar analítica rechazada. No retirar solo el banner y dejar nuevas solicitudes habilitadas.
6. Espacio, anuncio vacío/bloqueado, estabilidad visual, carga y controles utilizables en 1280/390/320 px. Nunca hacer clic en anuncios ni generar tráfico artificial para verificarlos.

Estos puntos son especificación y controles pendientes, no resultados de tests del proveedor.

## Separación de solicitud y activación

La cuenta ya comprobó titularidad con metadato. Google ofrece ese método para conectar el sitio antes de solicitar revisión; no necesitamos anuncios servidos para probar propiedad. Fuente: [conexión de sitio en AdSense](https://support.google.com/adsense/answer/7584263?hl=es).

G23 debe entregar una preparación verificable: diseño revisado, cargador/configuración desactivados, pruebas sin solicitudes reales y lista de controles externos pendientes. Hoy solo hay bloque real, configuración y maqueta de desarrollo, así que sigue abierto. G24 conserva revisión humana, administración, derechos/divulgaciones y confiabilidad; no se solicita por este documento. Las pruebas que necesitan anuncios reales o un sitio aprobado se ejecutarán en G25, después de aprobación y antes de habilitar el piloto para visitantes. Esta separación evita una dependencia circular sin afirmar que el trabajo pendiente ya esté hecho.

La activación permanece apagada hasta que Google indique sitio apto y se cumplan controles editoriales, técnicos y de privacidad. Perfil administrativo, recepción de contacto exterior, estabilidad G01 y siete ciclos útiles/muestra fija de G02 mantienen sus propias evidencias y responsables. La autorización de Google no sustituye esos controles del proyecto.
