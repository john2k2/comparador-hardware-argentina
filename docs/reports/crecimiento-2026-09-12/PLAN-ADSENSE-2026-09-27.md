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
