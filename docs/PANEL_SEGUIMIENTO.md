# Seguimiento privado del proyecto

Abrir `/admin/seguimiento` con una cuenta de administrador. El ingreso con Google al sitio no concede el rol de administrador.

## Leer el panel

- **Resumen:** personas medidas, llegadas desde Google, cobertura de ofertas y fallas registradas. Cada cifra muestra su fuente y período.
- **Conexiones:** resultado de la última consulta de cada servicio y último intento. Una autorización guardada no demuestra que un informe sea válido.
- **Mi seguimiento:** guardar qué se está revisando. Marcar algo como revisado no corrige el problema ni cambia las métricas.
- **Aprender:** explicación de cada indicador. Una salida hacia una tienda es un clic; no acredita una compra.

Las consultas reales incluyen Analytics, Search Console, Cloudflare, catálogo, registro operativo, GitHub, feed Eneba, logs de Supabase y AdSense. Google Ads requiere su autorización y un token de desarrollador aprobado. El estado de aprobación de AdSense se muestra separado de sus ingresos. Un dato ausente no se convierte en cero.

## Actualización fuera del servidor

`measurement-snapshot.yml` consulta las cuentas una vez al día, a las 06:43 UTC, desde GitHub Actions. GitHub puede retrasar el comienzo. El panel conserva la hora real de cada lectura.

**Actualizar lecturas** solicita una tarea y puede tardar unos minutos. **Recargar datos guardados** lee el resultado disponible. Abrir la página no consulta proveedores, no hace scraping y no renueva las fechas de los precios. Si una consulta falla, se conserva el último dato válido con su fecha y se registra el intento fallido.

El colector también puede ejecutarse en una computadora con la configuración privada existente: `node scripts/measurement-collect.mjs`. Una ejecución local depende de que esa computadora permanezca encendida; el seguimiento diario usa el runner existente.

## Operación y seguridad

El Worker valida la sesión con Supabase Auth y exige el rol de administrador en `app_metadata`. El resumen privado se lee con un destino y consulta fijos, tiene `Cache-Control: private, no-store` y no incluye credenciales. Las escrituras conservan las comprobaciones administrativas, de origen y de tamaño.

Los accesos a proveedores se cifran en la tabla privada `measurement_dashboard_entries`. La clave de cifrado debe conservarse estable en Cloudflare y en GitHub Actions; cambiarla sin migrar las autorizaciones impediría leerlas. No guardar claves en documentación, fixtures, artefactos ni logs.

El cliente actual de métricas es de escritorio. Sus autorizaciones existentes sirven para recopilar datos, pero renovarlas desde el dominio público requiere un cliente web. Esto es independiente del ingreso público con Google. Una autorización de Google en modo de prueba puede expirar y debe renovarse; no presentarla como conexión permanente.

## Reducir el procesamiento de la web

El build genera la portada sin precios congelados, documentos de las páginas fijas y una interfaz administrativa sin datos privados. El Worker sirve esta última sólo después de validar al administrador. La API entrega después el resumen privado.

Al seguir enlaces internos hacia estas páginas, se entrega HTML completo. Next 16 usa su navegación de documento completo al recibir este tipo de contenido. Las cabeceras RSC no permiten saltarse la validación administrativa ni convierten un documento público en un fragmento con datos de sesión. Sólo se admite el parámetro interno `_rsc`; otros parámetros mantienen el recorrido normal.

La selección pública de portada se guarda fuera de Cloudflare cada hora, al minuto 7 UTC. Esta tarea sólo lee catálogo e historial: no hace scraping ni consulta las cuentas de métricas. El Worker entrega únicamente esa fila de catálogo público con destino y clave fijos. Si el corte tiene más de 75 minutos, informa que no pudo cargar la selección. Cada lectura vuelve a aplicar las tres horas de las últimas ofertas; no renueva `lastUpdated`. No se presenta el fallback como una baja de precio real. La interfaz conserva búsqueda, guías, juegos y acceso al catálogo aunque falte una selección reciente.

Los documentos públicos elegibles tienen una caché interna de 60 segundos por versión publicada. Cada respuesta recibe un nonce nuevo en la política de seguridad, los scripts y los datos de hidratación. No se almacenan sesiones, respuestas con cookies, escrituras, consultas con parámetros ni fragmentos de navegación. Las páginas fijas se generan sin sesión y pueden servirse también a usuarios ingresados; su cuenta se carga luego en el navegador. Las fechas reales de precios y métricas permanecen intactas.

Las páginas dinámicas que no están en caché todavía generan su documento en Next. La verificación de recursos debe medirlas en producción, tanto en el primer acceso como en accesos repetidos. Un build aprobado o una respuesta 200 no prueban que desaparecieron los errores 1102/503.

La navegación global, las categorías de portada, las tarjetas de guías y comparativas y los enlaces a tiendas patrocinadas no precargan páginas. El usuario conserva la navegación al elegir un enlace, sin generar consultas de otras categorías antes de hacerlo. Se eliminó también la precarga del archivo SVG que ningún componente consume; los elementos del fondo mantienen su marcado.

El panel tampoco precarga el dashboard anterior. La sincronización de sesión usa el transporte nativo: exige el mismo origen, cuerpos acotados y un token validado por Supabase antes de guardar la cookie `HttpOnly`, `Secure` y `SameSite=Lax`. Esto no concede un rol; el panel vuelve a validar el permiso de administrador. Cerrar sesión elimina la cookie sin arrancar Next. Las fallas de Auth no guardan una cookie nueva y nunca devuelven el token.

### Corte público del 6 de octubre de 2026

La tarea solicitada desde el panel a las 05:13 UTC terminó a las 05:14:20 UTC: nueve fuentes verificadas, Google Ads pendiente, sin consultas fallidas y con ambos resúmenes guardados. Esto acredita esa ejecución; no garantiza las autorizaciones futuras de Google ni que el scheduler nunca se retrase.

Las trazas de las peticiones identificadas en producción midieron 0–1 ms de CPU para portada y comparador preparado, 1–5 ms para la selección pública de ofertas, 2 ms para la página administrativa y 4 ms para la lectura privada. La espera de red forma parte del tiempo total y no del tiempo de CPU.

El primer render de una ficha de producto consumió 217 ms, una categoría 47 ms y una consulta de `/api/products` 132 ms. Respondieron 200 en este corte, pero superan los 10 ms de CPU del plan gratuito. La tolerancia a ráfagas y la caché pueden ocultar el riesgo; la incidencia global queda abierta.

Para sostener costo cero, el siguiente trabajo se concentra en estas tres rutas: consultas públicas acotadas fuera del render de Next; documentos de producto y categoría preparados fuera del Worker, con sus metadatos y contenido indexable; y actualización de ofertas que conserve identidad, stock y observaciones reales. Exigir paridad de filtros, orden, paginación, variantes y elegibilidad temporal antes de reemplazar el recorrido auditado. Probar accesos sin caché y navegación real; no cerrar la incidencia sólo porque una página responde 200. No alojar la web pública en una computadora personal para resolver este presupuesto de CPU.
