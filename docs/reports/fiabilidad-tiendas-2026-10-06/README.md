# Fiabilidad de las 36 fuentes del Comparador

**Corte histórico de la candidata `codex/fiabilidad-todas-tiendas`, desde `dcefbe7`; código público de ese corte: `2dc40b8`.** Jonathan amplió el encargo de Maximus a todas las tiendas. La entrega aplica las reglas compartidas, inspecciona cada fuente integrada y conserva sus fallos. No acredita todo su catálogo. El trabajo comenzó el 06/10 Santiago y los cortes UTC son del 07/10.

**Actualización del 07/10:** lectores y diagnóstico publicados en `99d5917`, junto con la corrección del favicon, sin aplicar índices ni limpiar datos. [Publicación y verificación del sitio](publicacion/README.md). Los resultados siguientes conservan la revisión y la fecha originales; la cobertura y G02 siguen abiertos.

## Resultado verificable

- Inventario exacto: 36 tiendas, con plataforma, host, lector, rutas, pruebas y evidencia histórica. Los eventos históricos no representan ofertas únicas ni stock actual.
- Dos cortes públicos de una publicación por tienda: 63 solicitudes iniciales y 51 de componentes. Segundo corte: 17 lecturas con precio/stock, cinco agotadas; tres lecturas tienen conflicto de identidad/categoría y quedan fuera de aprobación automática.
- Después de corregir la exclusión de recomendaciones Qloud, el replay de las mismas capturas recupera Megasoft, Noxie y RocketHard. Son **20 lecturas entre corte y replay**, trece con stock informado y siete agotadas. No son veinte observaciones nuevas guardadas. Hyper sigue rechazado para su URL original.
- Las 16 fuentes restantes conservan causas distintas: bloqueo, publicación vieja/no encontrada, acceso/canonical o detalle dinámico sin evidencia suficiente. La [matriz por tienda](tiendas.md) fija la próxima acción de cada una.
- Revisión independiente: dos defectos reproducidos y corregidos, stock de otro SKU a igual precio y moneda USD tomada de metadatos numéricos. Dictamen final: ambos cerrados; sin otro fallo material en los consumidores revisados. No se afirma que esas fixtures hayan ocurrido en producción.

No inferir agotamiento de 404, bloqueo, ausencia de observación o vencimiento. Tampoco stock conocido, identidad o frescura de un HTTP 200. Los precios del informe son cortes con fecha; el harness no escribe ofertas ni adquiere jobs.

## Cambios por comportamiento

| Unidad | Resultado | Evidencia y reversión |
|---|---|---|
| 1 | Seed conserva intentos, código y tiempo incluso si falla | [Diagnóstico de cola](01-diagnostico-cola.md) |
| 2 | Índices estrechos preparados; aplicación remota en espera por capacidad | [Índices y límites](02-indices-cola.md) |
| 3 | Búsqueda Maximus excluye sugerencias y precios inválidos | [Búsqueda](03-maximus-busqueda.md) |
| 4 | Maximus vincula publicación, SKU, precio de pago y stock web del detalle V6 | [Detalle dinámico](04-maximus-detalle.md) |
| 5 | Producto principal/Offer/variante deben concordar; contradicción terminal | [Evidencia principal](05-evidencia-principal.md) |
| 6 | TiendaNube comparte evidencia y conserva stock desconocido | [TiendaNube](06-tiendanube.md) |
| 7 | Consumidores leen URL exacta primero y detienen fallbacks contradictorios | [Consumidores](07-consumidores.md) |
| 8 | Woo exige moneda ARS y excluye moneda extranjera principal | [Moneda](08-moneda-woo.md) |
| 9 | PortalTech conserva fecha del render al reutilizar caché | [Fecha real](09-fecha-portaltech.md) |

La unidad 5 excede el presupuesto de 400 líneas y registra `size:exception` tras una separación por comportamientos. No se redujeron comentarios, tests o legibilidad. Los commits y tamaños exactos quedan en `entrega.json`.

## Operación y capacidad

El ciclo natural 37558743501 falló antes del claim: cero intentos y observaciones nuevas. Los logs del servidor confirman tres cancelaciones 57014 por `statement timeout`; duraciones upstream de 8.104/8.465/8.625 ms. El SELECT equivalente, en otro corte sólo de lectura y sin INSERT, tardó 4.268 ms. Esto no identifica cuánto del fallo original era CPU, IO o locks. Una alternativa de dividir el SELECT excedió siete segundos y se descartó.

Los índices redujeron lecturas en PostgreSQL local sintético, con 76 migraciones, 59.160 productos y 73.291 ofertas. El beneficio depende de visibilidad/churn; no prueba recuperación remota. No se aumentaron timeouts/reintentos de producción ni se cambió el contrato de seed. [Diagnóstico real](db-diagnostico.json), [benchmark y método](seed-local.md).

**La recomendación de aplicar inmediatamente los índices cambia por capacidad.** Cuenta confirmada en plan Free; base real 926.215.315 bytes; caché 245.334.016 bytes. La consulta exacta contó 347.944 filas de caché, 346.397 vencidas (99,56%), con expiraciones desde marzo. `default_transaction_read_only=off` en el corte: no se declara que ya esté bloqueada por cuota. Supabase documenta un límite de base de 500 MB en Free y su posible restricción; tamaño de base y disco son medidas distintas. [Documentación oficial](https://supabase.com/docs/guides/platform/database-size), [metadatos y conteos](capacidad.json).

Primero revisar limpieza de caché vencida y retención vigente sin eliminar precios actuales, favoritos, alertas ni cambiar denominadores. El conteo no mide cuánto espacio físico se recuperaría; borrar registros no garantiza reducción inmediata de tamaño. La caché sola tampoco acredita volver bajo la cuota. Preparar una operación acotada y su efecto antes de autorizar borrado/mantenimiento o un cambio de plan. Los dos índices nuevos quedan preparados. **Los lectores y el diagnóstico pueden publicarse sin esa migración.**

## Verificación de la candidata

`npm run verify`: **1.816 unitarias aprobadas, dos omitidas preexistentes; 25 controles operativos; lint y tipos aprobados**. Replay local de 76 migraciones; 14 archivos SQL de CI aprobados y 3/3 pruebas concurrentes. OpenNext compiló y comprobó ocho documentos públicos; Wrangler dry-run aprobado. La instancia PG propia se detuvo al terminar. `verificacion.json` e `integridad.json` conservan resultados, comandos y hashes.

Los lectores ejecutaron el harness público del worker real. El replay de capturas no hizo HTTP ni renovó fechas; cinco precios principales mutados en memoria a $1 fueron rechazados. La prueba PortalTech de render/cache es simulada y no acredita el servicio real de Cloudflare. No hubo una nueva auditoría visual porque esta unidad no cambia UI; la evidencia pública de la versión `2dc40b8` pertenece a la entrega anterior.

## Repetición y siguiente cierre

El harness acepta muestra, directorio de salida e inventario. Ejemplo explícito de nueva lectura pública, **no ejecutado automáticamente al documentar**:

```sh
node scripts/qa/audit-store-sources.mjs docs/reports/fiabilidad-tiendas-2026-10-06/muestra-componentes.json tmp/fiabilidad-tiendas/nuevo-corte docs/reports/fiabilidad-tiendas-2026-10-06/inventario.json
```

Límites: cuatro solicitudes por tienda contando redirects, tres tiendas simultáneas, dos segundos entre solicitudes por host, 20 segundos y 16 MB por respuesta. HTTPS/host permitido; cuentas, carrito y checkout bloqueados. Sólo GET/HEAD y las dos consultas anónimas Maximus verificadas. Se eliminan del proceso las credenciales privilegiadas y no se usa DB. Un target descubierto sin clasificación fiable no se aprueba como comparable. Las capturas completas permanecen en `tmp`; el informe conserva hashes y hechos públicos, sin cuerpos de cuentas o credenciales.

Para publicar, separar código de la migración diferida y comprobar la revisión remota vigente. Después del despliegue aprobado, observar un ciclo natural correlacionado con su versión y sus acumulados. No despachar refresh para aparentar recuperación. Sólo un resultado guardado/comparable, con identidad, stock y fecha válidos, aporta cobertura útil. G02 y la meta existente siguen abiertas; Versus continúa aplazado. D03 medirá utilidad y retorno cuando ambos recorridos dispongan de ofertas fiables.
