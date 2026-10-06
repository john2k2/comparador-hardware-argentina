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

El build genera documentos de las páginas fijas y una interfaz administrativa sin datos privados. El Worker sirve esta última sólo después de validar al administrador. La API entrega después el resumen privado.

Los documentos públicos elegibles tienen una caché interna de 60 segundos por versión publicada. Cada respuesta recibe un nonce nuevo en la política de seguridad, los scripts y los datos de hidratación. No se almacenan sesiones, respuestas con cookies, escrituras, consultas con parámetros ni fragmentos de navegación. Las fechas reales de precios y métricas permanecen intactas.

Las páginas dinámicas que no están en caché todavía generan su documento en Next. La verificación de recursos debe medirlas en producción, tanto en el primer acceso como en accesos repetidos. Un build aprobado o una respuesta 200 no prueban que desaparecieron los errores 1102/503.
