# Plan de AdSense y monetización — 27/09/2026

## Objetivo y estado de partida

Preparar Comparador Hardware Argentina para solicitar AdSense y evaluar publicidad como ingreso complementario, sin perder utilidad al comparar precios ni consultas de asesoría. La autorización de Jonathan incluye crear este plan y subir los cambios locales revisados. No equivale a una cuenta creada, solicitud enviada ni aprobación de Google.

Datos comprobados en este corte:

- El sitio es un intermediario: muestra ofertas de comercios externos y ofrece ayuda; no procesa ventas propias. Las mejoras QVL enlazan soporte oficial y no certifican compatibilidad de una configuración.
- Hay rutas públicas de guías, comparativas, contacto, acerca, términos y privacidad. Su existencia no prueba calidad editorial, recepción del correo o cumplimiento legal.
- La búsqueda puntual en código no encontró una integración AdSense ni `public/ads.txt`. La política de privacidad aún presenta publicidad como incorporación futura.
- En la comprobación anterior a subir QVL del 27/09 a las 21:01 UTC, la portada respondió HTTP 503 / Cloudflare 1102. El build previo estaba aprobado: no se atribuye el error a cambios todavía locales. G01 vuelve a ser un bloqueo material para solicitar revisión.
- La nueva imagen social está desplegada en `3bc2d78` y verificada en LinkedIn. El post activo es https://www.linkedin.com/feed/update/urn:li:activity:7510076468136194048/.
- G02, G04 y G07 mantienen sus verificaciones pendientes. No se usan cifras antiguas de GSC/GA4 como estimación de ingresos actuales.
- Jonathan confirmó una cuenta AdSense existente y se inició su revisión autenticada. El dominio del comparador no figuraba en su lista de sitios durante este corte; todavía no hay solicitud para él. Perfil de pagos y cobro requieren completar verificación; el detalle de cuenta se conserva en evidencia local privada. No inferir el país por el dominio argentino.

## Criterio de Google y criterio del proyecto

AdSense requiere contenido propio útil, cumplimiento de políticas y un titular elegible. La página de requisitos consultada no publica un mínimo numérico general de tráfico o artículos: no presentaremos metas editoriales internas como requisitos de aprobación. Fuente: https://support.google.com/adsense/answer/9724?hl=es.

El contenido agregado debe aportar selección, explicación o valor propio; una reproducción de catálogos sin valor adicional puede incumplir las políticas. Revisar también los derechos sobre descripciones e imágenes. Fuente: https://support.google.com/publisherpolicies/answer/11190248?hl=es.

Google revisa el sitio y la cuenta; un HTTP 200 o una compilación aprobada no equivalen a aprobación. Los anuncios solo se habilitan tras el estado apto del sitio. Fuente: https://support.google.com/adsense/answer/12131223?hl=es.

Nuestras metas son: cero anuncios confundibles con ofertas, ninguna promesa de precio/stock sin observación reciente, privacidad acorde a lo implementado y medición separada de ingresos, salidas a tiendas y consultas. No prometemos aprobación ni una renta mensual.

## Calendario de preparación

Fechas propuestas para organizar el trabajo, sujetas a información de Jonathan y revisión externa. Una tarea dependiente no comienza por llegar su fecha; se mueve si falta evidencia. Codex representa trabajo asistido en esta tarea, no ejecución autónoma diaria de cambios de código.

| ID | Prioridad | Entrega | Responsable | Ventana propuesta | Dependencia y cierre verificable |
|---|---|---|---|---|---|
| G18 | P1 | Comprobar cuenta y elegibilidad administrativa | Jonathan + Codex | 27/09–01/10 | Cuenta existente o alta revisada; país de residencia/pagos confirmado; dominio y estado observados. Jonathan completa información personal y términos en Google. Sin datos sensibles en el repo. |
| G19 | P1 | Inventario editorial y derechos de uso | Codex | 27/09–02/10 | Muestra de portada, CPU, GPU, 3 guías/comparativas y 3 fichas; cada una con valor propio, fuentes, correcciones pendientes y elegibilidad de anuncios. Revisar plantillas y duplicaciones a escala. |
| G20 | P1 | Mejorar contenido original prioritario | Codex + Jonathan | 01/10–07/10 | G19; tres piezas iniciales con autoría real, revisión humana, fecha, criterios, límites y fuentes. Son meta interna. No inventar ensayos, estrellas o experiencias de compra. Coordinar con G10/G17. |
| G21 | P1 | Privacidad, contacto y consentimiento | Codex + Jonathan | 01/10–07/10 | G18 y auditoría del flujo real; política actualizada, opciones de control probadas y recepción del contacto G04. CMP certificada si corresponde a visitantes EEE/UK/Suiza. Resolver otros territorios según audiencia y requisitos aplicables. |
| G22 | P1 | Integración de verificación y ads.txt | Codex | 05/10–08/10 | ID auténtico de la cuenta; método ofrecido en AdSense observado. Metadato/ads.txt públicos verificados en www y dominio raíz; no habilitar anuncios automáticamente. CSP revisada con orígenes exactos requeridos, sin comodines generales. |
| G23 | P2 | Preparar espacios publicitarios y pruebas | Codex | 05/10–09/10 | G19/G21; configuración desactivada por defecto, lista de rutas permitidas, espacio reservado y rótulo Publicidad. Medir accesibilidad, estabilidad visual y carga con consentimiento aceptado/rechazado y bloqueador. |
| G24 | P2 | Revisión final y solicitud de AdSense | Jonathan + Codex | 09/10–12/10 | G18–G23 cerradas con evidencia y sin incidentes públicos materiales pendientes. G02 se revisa según su propio criterio; si la confiabilidad sigue siendo incierta se posterga. Registrar fecha y estado real de solicitud. Google decide el resultado; la fecha no es promesa de aprobación. |
| G25 | P2 | Piloto de anuncios tras aprobación | Codex + Jonathan | 13/10–09/11 | Sitio apto en Google, consentimiento operativo y espacios revisados. Fechas ilustrativas: comienza cuando se cumplan dependencias. Primera revisión a 14 días y decisión a 28 días completos. |
| G26 | P2 | Decidir continuidad y mezcla de monetización | Jonathan + Codex | 10/11–12/11 | G25; informe con ingresos reales, utilidad del sitio y consultas. Mantener, ajustar o pausar según criterios; si faltan datos conservar incertidumbre y reprogramar. |

Estos IDs se incorporan a BACKLOG.csv y al tablero conservando las tareas existentes. No se reemplaza la prioridad de confiabilidad G01/G02 ni el embudo G04/G07 por anuncios.

## Trabajo editorial concreto

1. **Procesadores y placas de video:** explicar cómo comparar contado/cuotas/envío, diferencias entre variantes, frescura y por qué se excluyen ciertas ofertas. Evitar párrafos genéricos repetidos por cada SKU.
2. **Guía de armado por presupuesto:** explicar casos de uso, compatibilidad, posibles cambios y costos que no se incluyen. Los totales deben provenir de ofertas observadas y mostrar fecha; si faltan piezas se informa un total parcial.
3. **Guía de RAM y motherboard:** explicar generación DDR, kits, revisión de placa, CPU/BIOS y QVL. Enlazar fabricantes y aclarar que no figurar no demuestra incompatibilidad. Las especificaciones requieren evidencia del modelo exacto.
4. **Fichas y comparativas:** separar datos del fabricante, observaciones de tiendas y recomendaciones propias. Añadir correcciones y procedencia sin simular reseñas ni vender como experiencia personal una descripción automática.
5. Revisar navegación, resultados vacíos y páginas casi idénticas. Mantener decisiones SEO existentes hasta una auditoría justificada; no desindexar todo el catálogo para perseguir AdSense.

## Cuenta, privacidad e integración

Usar una cuenta existente si corresponde; comprobarlo antes de crear otra. El país de pago debe ser el de residencia y recepción postal del titular, y Google indica que no se cambia después. Los datos personales, fiscales, bancarios y verificaciones de identidad se completan directamente en Google por Jonathan. Fuente: https://support.google.com/adsense/answer/7402253?hl=es.

Corte 27/09: la cuenta existente y la verificación del sitio están comprobadas; el país de residencia/recepción postal de Jonathan sigue sin confirmar. La guía oficial de Google muestra transferencia electrónica para Chile en pesos chilenos con ingreso de prueba, limitada a cuentas de AdSense creadas después del 30/09/2015. El método de pago se elige cuando la cuenta de pagos alcanza su umbral; no es una cuenta bancaria que debamos introducir para probar la titularidad del dominio ni un requisito demostrado para solicitar la revisión del sitio. Confirmar en la propia cuenta la antigüedad, perfil y opciones ofrecidas antes de decidir; no inferirlos por el país del comparador. Fuentes: https://support.google.com/adsense/answer/1714398?hl=es y https://support.google.com/adsense/answer/1709871?hl=es.

Preferir el método de verificación por metadato cuando esté disponible en la cuenta, para separar la revisión del sitio de la activación de anuncios. Publicar ads.txt con el identificador y línea entregados por Google; no usar un ID ficticio. Comprobar redirecciones y accesibilidad para el crawler. Fuente: https://support.google.com/adsense/answer/7584263?hl=es.

La política debe explicar cookies/datos, proveedores, finalidades, opciones del visitante y contacto real conforme al flujo implementado. Google exige estas divulgaciones; también prohíbe incentivar clics o hacer clic en anuncios propios. Fuente: https://support.google.com/adsense/answer/10502938?hl=es y https://support.google.com/adsense/answer/48182?hl=es.

Para anuncios personalizados a usuarios EEE, Reino Unido o Suiza se requiere CMP certificada compatible con TCF. Evaluar la solución de Google y probar preferencias y retiro; un banner artesanal no sustituye esa certificación. Fuente: https://support.google.com/adsense/answer/13554116?hl=es. No inferir ausencia de estas visitas por orientar el negocio a Argentina.

Diseño técnico previsto: un módulo de configuración con interruptor global, identificador real y slots explícitos; cargar el script una vez de acuerdo con la modalidad de consentimiento aprobada; espacios reservados para evitar saltos; exclusión de auth, admin, formularios privados y estados vacíos. Validar navegación Next.js y evitar solicitudes duplicadas. Mantener secretos fuera del cliente; los IDs públicos de editor no son contraseñas. El interruptor debe permitir revertir publicidad sin quitar el catálogo.

## Ubicaciones iniciales

- Lista permitida inicial: guías y comparativas que pasen G19/G20. Un bloque después de contenido sustancial; un segundo solo si longitud, diseño y medición lo justifican.
- Portada, búsqueda, fichas, comparador y armador: sin anuncios en el primer piloto; evaluar después con evidencia de utilidad y reglas de inventario aplicables.
- No activar anuncios automáticos, intersticiales, anclas o formatos que tapen filtros, precios, totales o contacto en la primera prueba.
- Publicidad visualmente distinguible del ranking, sponsors y enlaces a tiendas. No colocar anuncios junto a controles que puedan inducir un clic accidental.
- La elegibilidad de anuncios se decide por pantalla y contenido; aprobar la cuenta no vuelve elegibles todas las rutas. Fuente: https://support.google.com/publisherpolicies/answer/11112688?hl=es.

## Medición, límites y decisión

Antes del piloto, registrar 28 días completos de GA4/GSC accesibles, con fechas, zona horaria, consentimiento y cobertura. Si no hay 28 días comparables, conservar la ventana disponible identificada y prolongar observación; no inventar la base. Congelar la lista de rutas expuestas y evitar campañas/experimentos simultáneos que impidan interpretar cambios.

| Métrica | Fuente | Registro e interpretación |
|---|---|---|
| Ingresos estimados/finalizados, impresiones y RPM de página | AdSense | Fecha, moneda, rutas/canales disponibles y periodo; distinguir estimados de saldo definitivo. |
| Sesiones y páginas vistas en rutas del piloto | GA4 | Usuarios observados bajo consentimiento; no igualar pageviews a impresiones publicitarias. |
| Salidas a tiendas por sesión y tienda/categoría | GA4 G07 | Numerador y denominador; no confundir clic de anuncio con salida a comercio. |
| Intenciones y consultas recibidas | GA4 G07 + canal G04 | Lead intent y recepción real separados; sin datos personales en reportes públicos. |
| CTR orgánico, clics e impresiones | GSC | Comparar 28 días completos contra 28 anteriores; no atribuir cambios causalmente a anuncios sin control. |
| LCP, INP y CLS | CrUX cuando exista + pruebas controladas | Campo y laboratorio separados; ausencia de CrUX no equivale a rendimiento bueno. |
| Errores, bloqueos, confusión y quejas | Monitoreo y feedback | Registrar caso reproducible y acción; nunca contar falta de acceso como cero. |

Ingresos orientativos solo después de medir: `páginas vistas monetizadas / 1000 × RPM de página observado`, manteniendo moneda y periodo. No usar CPM de impresiones ni RPM prestado para presentar una proyección como ingreso real.

Límites internos propuestos, no requisitos de Google: pausar el piloto inmediatamente ante anuncios confundibles, clic accidental reproducible, falla de consentimiento, incumplimiento señalado o controles tapados. Investigar una caída de más del 10% en salidas a tiendas por sesión respecto de una base comparable; no declarar efecto si hay poca muestra, cambios de catálogo o mezcla de tráfico distinta. Revisar CLS >0,1 o un aumento reproducible de LCP >20% en pruebas iguales. Ante muestra insuficiente conservar abierto G26 y ampliar la ventana.

A los 14 días: verificar medición, políticas y uso. A los 28: contrastar ingresos con pérdida de derivaciones/consultas y costo de mantenimiento. Mantener solo si no perjudica la experiencia y aporta valor medido. No usar bots, recargas artificiales, clics propios ni pedir clics de apoyo. En caso de rechazo, registrar el motivo exacto, corregir las páginas afectadas y volver a solicitar cuando haya evidencia; no reintentar sin cambios.

## Seguimiento y otras fuentes de ingresos

Cada lunes: actualizar estado real de G18–G26, bloqueos y próximas tres acciones junto con G02/G04/G07/G12. La automatización revisa documentación y estados accesibles; no acepta términos, solicita revisión, activa anuncios, despliega ni cambia credenciales. Solo avisa ante decisión, rechazo, aprobación, falla nueva o dato material. Conservar el histórico de cada corte.

Jev puede dar una segunda opinión sobre alternativas concretas (por ejemplo, continuar el piloto, reducir slots o pausarlo) una vez por bifurcación material. No es fuente de métricas ni autoriza acciones. En este corte no está disponible su herramienta; no se obtuvo ni se simula una recomendación.

Sponsors se evalúan con derivaciones y canal comercial verificados, sin alterar rankings orgánicos. ScorpioPC continúa como candidato pendiente de verificación. Las asesorías se miden por consultas recibidas y servicios realizados; país/zona de armado y reparación siguen por confirmar. AdSense no exige asumir venta propia ni reemplaza esos caminos.

## Primera secuencia de ejecución

1. Subir cambios QVL revisados y documentos publicables; comprobar la producción que resulte del despliegue.
2. Confirmar cuenta y país con Jonathan y completar inventario G19, manteniendo G02/G04/G07 como prioridades de confiabilidad y medición.
3. Preparar contenido, privacidad y verificación antes de solicitar. Activar anuncios únicamente tras aprobación y comprobaciones del piloto.

Presupuesto inicial: preparación con herramientas existentes y solicitud sin compra de tráfico. Cualquier servicio pagado, obligación fiscal o configuración comercial se decide con información real; no hay gasto aprobado por este documento. Revertir QVL como unidad independiente; revertir futuros anuncios mediante configuración y comprobar que el script deja de cargar. La documentación conserva motivos y resultados.

## Resultado de la subida — 27/09/2026, 21:08 UTC

main actualizado hasta af69ef8 y Workers Builds aprobado. Portada, armador y categorías CPU/GPU respondieron 200, pero dos fichas conocidas devolvieron 503/1102. Hay recuperación parcial y se mantiene el bloqueo de G01; no se solicita AdSense por llegar una fecha del calendario. Cuenta revisada: perfil particular chileno ofrecido sin asociación completada; modalidad, moneda y banco todavía no configurados/verificados. Próximo paso administrativo: Jonathan confirma y completa sus datos reales directamente en Google. El plan no incluye información personal de pagos. Ver VALIDACION.md.

## Preparación en ejecución — 27/09/2026

G21 ya comenzó: control GA4 básico y política alineada al flujo real, con 19 pruebas y comprobación local en escritorio/móvil; falta publicación/verificación pública, recepción real de contacto y preparación de CMP para anuncios aplicables. G19 cuenta con inventario de muestra y registro de incertidumbres en INVENTARIO-EDITORIAL-ADSENSE-2026-09-27.md. Tres mejoras G20 definidas, no completas. En la última comprobación de la versión 59981bda las fichas CPU/ASRock y una guía volvieron a 200; G01 sigue en observación tras fallo exceededCpu registrado en versión anterior. La solicitud sigue sin habilitarse hasta completar la auditoría de todos los controles.

## Contenido y consentimiento publicados — 27/09/2026

G21: la versión 2731303 pasó pruebas locales pero la comprobación pública encontró que Preferencias de privacidad desaparecía tras hidratar el navegador. El cliente no tenía el mismo identificador GA4 que el servidor. Corrección 622f2d9: el servidor conserva el control de visibilidad y el bootstrap entrega el identificador al helper de eventos. Workers Builds aprobado. Prueba aislada pública desktop 1440 px y móvil 390 px: cero cargas de Google al entrar/rechazar, una carga al aceptar, retiro con recarga y eliminación de cookie accesible, sin desbordamiento. Se interceptó el script y se bloquearon eventos externos para no contaminar GA4. Veinte pruebas unitarias de consentimiento/eventos aprobadas. No es una CMP de publicidad ni prueba de recepción G04.

G20: f2ac9f3 incorpora metodología original para /guia/pc-gamer-2-millones, /comparativa/ryzen-5-7600x-vs-ryzen-7-5700x y /comparativa/rtx-4060-vs-rx-7600. Fuentes AMD/NVIDIA, alcance de benchmarks externos, costos excluidos y compatibilidad por motherboard/BIOS/QVL. Se eliminó la afirmación incorrecta de cooler incluido del 5700X y promesas genéricas no respaldadas. Fecha editorial solo en esas tres piezas, redacción asistida declarada y ninguna atribución inventada de ensayos o revisión humana. Comparativas: ofertas con más de tres horas o fecha inválida ya no participan del ganador actual. Guías: fecha de observación por oferta registrada y advertencia de total parcial. Lectura de comparativas acotada a dos consultas por modelo de hasta 32 filas cada una, conservando validación de identidad. Esta optimización no demuestra cobertura completa ni corrige por sí sola todas las causas de 1102.

Validación local: 43 pruebas de selección/precios/FAQ aprobadas, lint, TypeScript y build de 51 rutas aprobados. Navegador aislado en las tres rutas y dos tamaños: HTTP 200, fuentes y metodología visibles, sin desbordamiento ni errores JS en la muestra. Capturas y JSON en cortes/2026-09-27/editorial y adsense-consent-public, excluidos del Git público. G20 en revisión en BACKLOG y tablero; publicación pública y revisión humana se registran por separado. G19 mantiene derechos y muestra pendiente. G01 continúa en observación y G02 no se cierra antes de su ventana medida.

Cuenta AdSense revisada nuevamente en Chrome: Información para pagos indica Datos de pago no disponibles. Añadir cuenta de pagos ofrece un perfil particular de Chile y solicita nombre/domicilio; no presenta todavía un método bancario. No se envió el formulario ni se asociaron datos. Confirmación de residencia pendiente. Para cobro, Google exige banco/sucursal en el país del perfil; la tabla EFT incluye CLP para Chile con condición de cuenta creada después del 30/09/2015. La fecha de creación y métodos habilitados de esta cuenta no están verificados. Fuentes: https://support.google.com/adsense/answer/7164701?hl=es y https://support.google.com/adsense/answer/1714398?hl=es. Completar datos reales directamente en Google; no guardar domicilio, identificadores de perfil o datos bancarios en documentos públicos.

## Comprobación pública del contenido — 27/09/2026, 21:53 UTC

Workers Builds de f2ac9f3 aprobado. Las tres piezas G20 respondieron 200 y mostraron metodología, fuentes y fecha editorial correctas en escritorio/móvil; la comprobación no detectó errores JS ni desbordamiento. El script de prueba bloqueó telemetría externa. Ficha GPU fija Gigabyte RTX 5060 Eagle, ID agrupado-tarjetas-graficas-gigabyte-rtx-5060-eagle-8gb-1i1rdb: 200, título correspondiente y advertencias de referencia/actualización visibles. Esto valida render de la muestra, no stock ni frescura de sus ofertas. Muestra runtime de G19 completada; registro de derechos de assets compartidos y revisión humana siguen pendientes. G20/G21 permanecen en revisión; no hay solicitud de AdSense, anuncios activos ni ingresos verificados. G01 sigue en observación. El cambio de consentimiento del 27/09 altera cobertura GA4: conservar fecha y comparar ventanas identificadas, sin interpretar usuarios no medidos como cero ni pérdida confirmada de tráfico.

## Preparación de conexión AdSense — 27/09/2026

El dominio comparador-hardware.com.ar se añadió a Sitios en la cuenta existente y quedó en Debe revisarse. Se observaron en la interfaz los métodos etiqueta meta y ads.txt y se contrastó su ID público con el código; no es una credencial. Commit 0be5b5e incorpora metadato de propiedad y public/ads.txt. No incorpora scripts de anuncios ni nuevos orígenes CSP. Lint, TypeScript y build local aprobados; comprobación pública/Verificar de Google todavía pendiente de despliegue. Solicitar revisión no se accionó. G22 comenzó sin cambiar perfil de pagos ni asumir país.

Google generó automáticamente al añadir el dominio un mensaje de Reglamentos europeos, visible como Publicado. Inspección del mensaje de este dominio: idioma predeterminado inglés, 31 idiomas adicionales, consentir/gestionar/no consentir activados, optimización automática de mensajes activada. No se cambiaron opciones ni proveedores; los contadores de preview no prueban proveedores reales ni exposición pública. G21 sigue abierto hasta revisar configuración exacta, integración y retiro de consentimiento publicitario; no confundir el control GA4 ya publicado con la CMP. No se tocaron mensajes de otros sitios.

Registro de recursos compartidos en REGISTRO-ASSETS-ADSENSE-2026-09-27.md. Licencia SIL OFL 1.1 de Press Start 2P verificada contra Google Fonts y conservada sin modificaciones en public/licenses/PressStart2P-OFL.txt. Logo, favicon, sprites y OG siguen con procedencia pendiente, sin infracción o permiso inferidos. Registro por uso evita presentar todas las imágenes del catálogo como habilitadas para publicidad.

## Propiedad AdSense verificada — 27/09/2026

G22 completado. Workers Builds de 0be5b5e aprobado. Comprobación pública: ads.txt exacto con ID de la cuenta en dominio raíz y www responde 200; portada y tres piezas piloto incluyen metadato correcto y cero scripts/peticiones de anuncios. Dominio raíz también devuelve metadato correcto con 200. En Chrome, Google confirmó explícitamente Tu sitio se ha verificado mediante etiqueta meta. Evidencia local privada: cortes/2026-09-27/adsense-verification/PUBLICO.json y google-sitio-verificado.png. La verificación de propiedad no equivale a aprobación publicitaria. Solicitar revisión no se accionó; el estado del rastreo ads.txt de Google puede actualizarse después y no se presume inmediato. CSP conserva sus orígenes previos porque la conexión no carga anuncios.

G18/G19/G20/G21/G23/G24 continúan abiertos según sus controles. Perfil de pagos sin asociación completada; revisión humana y origen de recursos gráficos pendientes; CMP automática detectada pero sin prueba pública/regional ni retiro TCF verificados. G02 y confiabilidad conservan sus criterios. No hay anuncios activos ni ingresos verificados.

## Mensaje europeo y contacto — 27/09/2026

La cuenta AdSense creó un mensaje europeo automáticamente para este dominio al añadirlo. En Chrome se corrigió solo el mensaje del comparador: idioma predeterminado español; opciones Consentir, Gestionar opciones y No consentir visibles en la vista previa; optimización automática de variantes desactivada para conservar una sola experiencia de consentimiento. Cambios publicados en Google y persistencia comprobada reabriendo el editor. La vista previa en español quedó en cortes/2026-09-27/adsense-verification/mensaje-espanol-sin-optimizacion.png. No se modificó el mensaje del otro sitio ni se activó el script de anuncios. Google avisa que su mensaje puede tardar hasta una hora en mostrarse una vez haya etiqueta de AdSense; la propiedad actual se verifica solo con metadato, así que la entrega de CMP al visitante, el comportamiento por región y el retiro TCF permanecen sin prueba. El control GA4 propio sigue siendo independiente. G21 abierto.

Comprobación G04 acotada: /contacto responde 200 y sus CTA de asesoría, soporte y propuestas comerciales forman enlaces mailto al correo operativo confirmado por Jonathan. Una prueba única desde el mismo Gmail conectado hacia sí mismo con asunto de consulta apareció en INBOX; no se contó como consulta real, lead ni tráfico. Esta prueba interna demuestra recepción del propio buzón, no entregabilidad desde un remitente ajeno ni que alguien haya respondido desde el sitio. G04/recepción comercial exterior siguen pendientes hasta una prueba externa o una consulta verificable; no se inventan ceros.

## Observaciones de Jonathan sobre los precios — 27/09/2026

La revisión humana de las tres piezas G20 identificó precios que no coinciden con la tienda y placas sin publicación verificable. No declarar G20 completado. El ajuste en curso elimina estimados numéricos de las guías cuando faltan ofertas recientes, restringe el subtotal a ofertas observadas dentro de 3 h y añade fecha y enlace de comprobación a los precios de comparativas. El dato sigue siendo una observación, no un precio garantizado en la tienda. Revalidar la vista pública tras despliegue y pedir una segunda lectura de Jonathan; G02 mantiene la comprobación de frescura del catálogo como requisito independiente.

Jonathan confirmó origen propio sin material externo para logo, favicon, sprites e imagen social nueva; el registro de assets acota esa confirmación. El inventario de plantillas mostró siete comparativas y tres guías con estructura común, de las cuales solo las tres piezas piloto tienen metodología editorial específica. Las fichas y listados usan imágenes remotas de tiendas sin permiso documentado. En la fase inicial limitar anuncios a páginas editoriales aprobadas; evaluar cada plantilla antes de ampliar la cobertura. Una ausencia temporal de ofertas no obliga por sí sola a desindexar un artículo útil, pero impide presentarlo como comparativa de precios comprables.

La observación de Jonathan motivó una segunda mejora de G20/G02: el presupuesto conserva por pieza la última oferta conocida de hasta 30 días como referencia explícitamente histórica, fuera del subtotal, y agrega un botón que solicita la nueva comprobación de hasta siete publicaciones conocidas mediante la cola a pedido existente. No se ejecuta scraping en la visita ni se actualiza la fecha sin respuesta de la tienda. La muestra local de la guía de $2M encontró cinco referencias y ninguna oferta dentro de 3 h; no había publicación conocida para GPU ni gabinete. Es un límite de cobertura y una señal para G02, no un precio cero ni un armado comprable. Verificar el comportamiento público y al menos una ejecución real antes de declarar operativo el nuevo flujo.

La prueba pública se completó: la cola despachó el workflow y 2/5 publicaciones se actualizaron; tres fallaron y solo CPU apareció como precio reciente en la guía. Una RAM actualizada quedó correctamente excluida por revisión de identidad pendiente. Las referencias de SSD SATA y fuente Bronze que no correspondían al tipo especificado motivaron guardas adicionales; la búsqueda de modelos GPU concretos fuera del top general permite mostrar una referencia RX 7600 para que el usuario solicite su comprobación. Sigue siendo un precio histórico, no un valor actual garantizado. Próxima prioridad de G02: comprobar una GPU y un conjunto completo representativo antes de considerar la guía apta como presupuesto comprable o soporte publicitario.

La RX 7600 se comprobó luego en CompraGamer a $533.350 con descuento por depósito o transferencia; el precio normal para otros medios era $592.611. La guía de $2M llegó a 2/7 partes recientes y $904.870 de subtotal incompleto. La guía de $3M logró persistir sus tres referencias, aunque la RTX 5070 quedó bajo revisión de identidad; no se puede usar ese dato como precio recomendado. También se explicitó en la fila de precio que el medio de pago y el envío pueden alterar el total. G20 y G02 siguen abiertos: faltan componentes recientes, compatibilidad y costo completo comprobable para presentar cualquiera de estos presupuestos como compra ejecutable.

La validación de $3M reveló además que el selector genérico reemplazaba el Ryzen 7 declarado por un Ryzen 5 y una referencia RTX 5070 por la variante Ti. Las guías editoriales pasan a exigir coincidencia con sus componentes; el constructor libre conserva la selección flexible. Si un subtotal verificado supera el objetivo, la página lo advierte sin ocultar el dato. La única publicación conocida de $1M falló al comprobarse porque el enlace antiguo de motherboard A PRO presenta ahora un modelo B; no se inventará un precio para completar ese presupuesto. Las tres guías se revalidaron en producción después del cambio y G20 continúa abierto.

El primer render con esa corrección mostró aún un kit DDR5 6000 como alternativa a los 5600 declarados para $2M; la guarda de memoria ahora exige velocidad y formato de kit indicados. Aunque esto reduzca los precios visibles, evita presentar piezas distintas como si fueran el presupuesto editorial aprobado. El siguiente control de G02 debe conseguir ofertas recientes de los componentes exactos y registrar medio de pago antes de usar un total para monetización o asesoría.

Estado público final 27/09: $1M 0/7 piezas recientes sin subtotal; $2M 2/7 y subtotal parcial $904.870; $3M 2/7 y subtotal parcial $1.180.478. Ningún armado tiene las siete piezas con precios comprobados, por lo que no se anunciará como PC completa a ese precio.

## Selección de $2M corregida y siguiente control — 28/09/2026, 00:28 UTC

El corte de las 00:16 UTC sustituye el estado anterior de precios, que se conserva como histórico: $2M tiene 7/7 piezas elegibles y ARS 1.934.428; $1M tiene 1/7 y subtotal ARS 71.999; $3M tiene 2/7 y subtotal ARS 1.180.478. Solo $2M completó la lista en esa observación. Las ofertas deben seguir cumpliendo identidad, stock y observación ≤3 h; el total no se congela como precio garantizado. Envío, armado, licencia y periféricos quedan fuera. Informe y evidencia: PRECIOS-Y-PRESUPUESTOS-2026-09-27.md.

Se revisaron las referencias compartidas y la consistencia de las plantillas. La FAQ del índice de guías ahora explica la búsqueda de la siguiente oferta disponible y la lista de compra con controles; ya no afirma que aparece una fila “sin precio reciente”. Los últimos dos usos activos de la imagen social legada se sustituyen por la imagen nueva declarada para el proyecto. No se eliminan archivos históricos ni se conceden permisos sobre fotos de tiendas.

Próximos controles, en orden: aprobación humana de las tres piezas G20 tras estas correcciones; confirmar país real y completar datos administrativos directamente en Google para G18; resolver consentimiento publicitario/contacto G21 y revisar disponibilidad G01/frescura G02. G23 se limita a las tres rutas documentadas en el inventario, sin publicidad activa. G24 no se ejecuta por completar una compilación. Los siete ciclos útiles de G02 siguen sujetos a su ventana, con primer control posible el 03/10; los jobs manuales de esta guía no sustituyen ese criterio.
