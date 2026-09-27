# GEO Technical SEO Audit — comparador-hardware.com.ar

Fecha: 9 de septiembre de 2026. Alcance: home, `/comparar/procesadores`, una guía, robots y sitemap; verificación sin sesión.

## Puntaje técnico: 76/100 — bueno, con una alerta operativa

| Categoría | Puntaje | Estado | Evidencia |
|---|---:|---|---|
| Crawlability | 11/15 | Warn | `robots.txt` responde y declara sitemaps; la comprobación posterior de sitemap recibió 503 de Cloudflare. |
| Indexability | 10/12 | Pass | Las categorías canónicas son `/comparar/...`; `/search?category=...` sin filtros redirige 308. Semrush conserva el snapshot previo. |
| Seguridad | 10/10 | Pass | HTTPS, HSTS 2 años, CSP, `nosniff`, `DENY`, referrer y permissions policy en home y categoría. |
| URLs | 7/8 | Pass | `/comparar/...` limpio y HTTP→HTTPS 301; falta confirmar absorción de las rutas legadas en los próximos 28 días. |
| Móvil | 8/10 | Pass | Next responsive; no se ejecutó test de tap-targets visual. |
| Core Web Vitals | 8/15 | Warn | sin CrUX verificable en esta auditoría; las respuestas alternaron 200 y 503. |
| SSR | 15/15 | Pass | Next App Router, metadatos/JSON-LD generados en servidor; Google ya extrae el contenido de categorías. |
| Rendimiento/servidor | 8/15 | Warn | Cloudflare presente; 503 transitorios impiden declarar TTFB saludable. |

## Hallazgos

1. **P0 confirmado: el plan Workers Free no admite esta aplicación SSR.** El 9 de septiembre se reparó la integración Git (el comando de build pasó de `npm run build` a `npx opennextjs-cloudflare build`) y el despliegue publicó correctamente. Sin embargo, los registros en tiempo real muestran `ExceededCpu` para `/comparar/procesadores`, `/api/products` y también algunas rutas públicas: el límite aplicado es **10 ms de CPU** y la aplicación consume más. La home puede responder desde assets estáticos, pero eso no prueba que el servicio esté operativo. Workers Free tiene ese límite; Workers Paid ofrece hasta 5 minutos. No es rate limiting ni un fallo de DNS.
2. **P1 de transición SEO:** Search Console y Semrush aún atribuyen visibilidad a `/search?category=tarjetas-graficas`, `/search?category=procesadores` y `/search?category=motherboards`; en el producto, la URL desnuda ya redirige 308 a `/comparar/...`. Medir hasta el 7 de octubre antes de tomar medidas adicionales.
3. **P2:** HTML no negocia `text/markdown`; es una mejora futura, no un error. No se evaluaron `Link` headers de servicio porque no hay API pública orientada a terceros.

## Acceso de crawlers IA

`robots.ts` usa `User-agent: *`, permite `/`, `/comparar/`, `/product/` y `/llms.txt`, y bloquea solo admin/API/auth. GPTBot, Googlebot, Bingbot, PerplexityBot, ClaudeBot, Google-Extended y CCBot quedan permitidos salvo reglas externas no observadas.

## Próximas acciones

1. Resolver la incompatibilidad de capacidad antes de medir SEO: autorizar Workers Paid y establecer un límite de CPU explícito, o rediseñar la aplicación para servir solo estático y mover las consultas dinámicas a otra infraestructura. No presentar la home 200 como disponibilidad completa mientras las rutas indexables den 503.
2. En 28 días, contrastar impresiones de `/search?category=` contra `/comparar/` y solicitar recrawl de las limpias si no migran.
3. Tomar CrUX/PageSpeed de las tres rutas cuando el origen esté estable; no inferir CWV desde los 503.
