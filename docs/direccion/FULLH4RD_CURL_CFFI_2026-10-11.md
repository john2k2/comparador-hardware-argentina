# FullH4rd: prueba local con curl_cffi — 11/10/2026

## Resultado

`curl_cffi` no resolvió el acceso automático en esta prueba desde la Mac. Dos procesos independientes, sin cookies iniciales ni persistencia de sesión, recibieron HTTP 403 y HTML de desafío Cloudflare. No se obtuvo ninguna observación válida de precio o stock. La ficha ensayada fue la publicación 29893, ASUS PRIME RTX 5080 OC 16GB; el SKU conocido VGA2831 no se revalidó mediante estas respuestas.

| Ejecución | Recepción UTC | PID | HTTP | HTML | Resultado |
|---|---|---:|---:|---:|---|
| Inicial | 17:12:12.644384 | 8677 | 403 | 6.125 bytes | Desafío; se detuvo antes de otras fichas |
| Proceso nuevo | 17:12:50.435503 | 8733 | 403 | 6.125 bytes | Desafío; bloqueo reproducido |

Se hicieron dos solicitudes en total, separadas por unos 38 segundos. La segunda prueba reinició el proceso Python, no la Mac. No se rotaron perfiles, importaron cookies de Chrome, utilizaron proxies ni contrataron servicios. No se probaron las otras cuatro fichas ni la categoría porque el acceso falló en la primera.

El hecho de que Chrome habitual hubiera abierto una ficha anteriormente no demuestra acceso del lector automático. Tampoco permite atribuirle a estas dos respuestas un precio, SKU o stock observado. No se renovó ninguna fecha ni se guardaron ofertas en SQLite, Supabase o D1.

## Entorno y reproducción

Mac arm64, Python 3.12.13 y curl_cffi 0.16.3, instalados en un entorno aislado dentro de `outputs/fullh4rd-curl-cffi-2026-10-11/.venv`. El perfil fue la opción soportada `chrome`, con certificados verificados y sesión vacía.

El script `scripts/pilots/fullh4rd-curl-probe.py` sólo realiza una prueba acotada. Fija destinos públicos conocidos, máximo ocho solicitudes, hasta tres redirecciones dentro de los hosts HTTPS de FullH4rd, veinte segundos por solicitud, ocho MiB por respuesta y tres segundos entre solicitudes de una ejecución. Se detiene ante 403/429 o desafío, incluso si éste responde 200. No contiene un adaptador de catálogo.

```sh
uv venv --python /opt/homebrew/bin/python3.12 outputs/fullh4rd-curl-cffi-2026-10-11/.venv
uv pip install --python outputs/fullh4rd-curl-cffi-2026-10-11/.venv/bin/python -r scripts/pilots/fullh4rd-curl-probe.requirements.txt
outputs/fullh4rd-curl-cffi-2026-10-11/.venv/bin/python scripts/pilots/fullh4rd-curl-probe.test.py
```

La ejecución real usa `--output <directorio-nuevo> --limit 1`; aumentar a seis destinos sólo tiene sentido si la primera ficha devuelve datos utilizables. Un directorio existente se rechaza para no reemplazar evidencia. No programar este experimento ni limpiar las pausas del consumidor automático para repetirlo.

## Verificación y evidencia

Pasaron cinco pruebas sin red: corte ante 403/429, desafío con HTTP 200, rechazo de redirección externa, presupuesto de solicitudes y límite de tamaño. Los recibos locales acreditan PIDs diferentes, cero cookies iniciales, dos desafíos y cero observaciones de precio/stock. Una respuesta 200 futura todavía exigiría contrastar identidad, precio principal, condición de pago y stock web/local; estas pruebas no sustituyen ese contraste.

Recibos y cuerpos privados: `outputs/fullh4rd-curl-cffi-2026-10-11/{first,restart}/`. Los cuerpos conservan hash y hora de recepción; directorios 0700 y archivos 0600. No se versionan cuerpos, cookies ni el entorno Python.

La metadata de producción coincidió antes y después: despliegue `5b77fc37-9fea-48df-aca5-e1c43956f0a6`, versión `4add74ae-b3f4-4165-8040-5f143505c977`, fecha `2026-10-10T22:55:51.363775Z` y etag iguales. Cortes de sólo lectura en `outputs/ciclo-automatico-mac-2026-10-11/curl-cffi-{inicio,final}.json`, último a las 17:12:52.982 UTC. No se publicó ni se envió código a GitHub. El ensayo no emitió consultas o escrituras D1; la lectura del panel no equivale a demostrar consumo cero de otros procesos.

## Decisión

FullH4rd continúa sin una fuente automática validada. Mantener sus fallos y pausas visibles, sin presentar precios anteriores como recién revisados. Continuar con asociaciones y fuentes que sí permiten observaciones reproducibles. Una sesión Chrome que permita ver la página no acredita actualización autónoma tras reinicios ni cobertura del catálogo completo.

Reversión: retirar el script, sus pruebas, el archivo de dependencia y este informe. Eliminar el entorno aislado cuando deje de ser útil, conservando los recibos si se necesita comparar otra prueba. No hay cambios de base, configuración global, scheduler o producción que revertir.
