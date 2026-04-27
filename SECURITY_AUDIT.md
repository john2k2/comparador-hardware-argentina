# Auditoría de Seguridad - Comparador Hardware Argentina

## Fecha: 2026-04-27
## Entorno: Vercel (Free Tier) + Supabase

---

## 🔴 CRÍTICO - Problemas de Seguridad

### 1. Rate Limiting Inefectivo (CRÍTICO)

**Problema:** El rate limiting usa `Map` en memoria local.

```typescript
const buckets = new Map<string, Bucket>(); // ¡Esto es local por instancia!
```

**Impacto:**
- En Vercel (serverless), cada request puede ir a una instancia diferente
- Un atacante puede hacer 10,000 requests/minuto distribuyendo entre instancias
- El rate limit es efectivamente inútil en producción

**Solución:** Usar Redis o la base de datos para rate limiting distribuido.

**Archivo:** `src/lib/server/rate-limit.ts`

---

### 2. CSP (Content Security Policy) Permisivo (ALTO)

**Problema:** La CSP actual permite demasiado:

```
script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com
```

**Impacto:**
- `'unsafe-inline'` permite ejecutar cualquier script inline
- Un XSS puede inyectar scripts directamente
- No hay nonce o hash para scripts inline

**Solución:** 
- Remover `'unsafe-inline'`
- Usar nonces para scripts inline (ya se genera nonce en layout.tsx)
- Agregar `strict-dynamic` si se usan scripts externos

**Archivo:** `next.config.ts`

---

### 3. Falta de CORS en API Routes (ALTO)

**Problema:** No hay configuración de CORS en los endpoints de API.

**Impacto:**
- Cualquier sitio web puede hacer requests a tu API
- Un atacante puede usar tu API desde otro dominio
- Posible abuso de la API de búsqueda

**Solución:** Agregar headers CORS restrictivos a las API routes.

**Archivos:** `src/app/api/*/route.ts`

---

### 4. Headers de Seguridad Faltantes (MEDIO)

**Problema:** Faltan headers importantes:

- `Strict-Transport-Security` (HSTS) - No está configurado
- `Permissions-Policy` - No está configurado
- `X-XSS-Protection` - No está configurado (aunque es obsoleto, ayuda en browsers antiguos)

**Solución:** Agregar headers faltantes en `next.config.ts`.

---

### 5. Vercel Free Tier - Limitaciones de Seguridad (MEDIO)

**Problemas del plan gratuito:**

1. **Sin WAF (Web Application Firewall)**
   - No hay protección contra SQL injection, XSS, etc.
   - Vercel Pro tiene WAF integrado

2. **Sin Rate Limiting de Edge**
   - Vercel Pro tiene rate limiting en el edge
   - El plan gratuito solo tiene el que implementes tú

3. **Sin Analytics de Seguridad**
   - No hay logs de intentos de ataque
   - No hay alertas de tráfico sospechoso

4. **Funciones Serverless Limitadas**
   - Máximo 10 segundos de ejecución (15 en Pro)
   - Máximo 1024MB de RAM (3008MB en Pro)
   - Cold starts frecuentes

5. **Sin Soporte Prioritario**
   - Si hay un incidente de seguridad, no hay soporte 24/7

---

## 🟡 ADVERTENCIAS - Mejoras Recomendadas

### 6. Secrets en Variables de Entorno

**Problema:** Algunos secrets podrían estar expuestos:

```typescript
// Esto está bien (server-side only)
process.env.SUPABASE_SECRET_KEY
process.env.CRON_SECRET

// Pero verificar que no haya:
process.env.NEXT_PUBLIC_* // Solo para datos públicos
```

**Verificación:** Revisar que ningún secret tenga prefijo `NEXT_PUBLIC_`.

---

### 7. Autenticación de Admin

**Problema:** La autenticación usa cookies sin flags de seguridad explícitos.

```typescript
const ADMIN_AUTH_COOKIE_NAME = 'sb-access-token';
```

**Mejora:** Asegurar que las cookies tengan:
- `Secure` (solo HTTPS)
- `HttpOnly` (no accesible por JavaScript)
- `SameSite=Strict`

---

### 8. Validación de Inputs

**Problema:** Algunos endpoints podrían no validar suficientemente los inputs.

**Verificar:**
- `/api/search` - Validar longitud máxima de query
- `/api/admin/catalog-refresh` - Validar parámetros
- `/api/products` - Validar IDs

---

## 📋 Plan de Acción Prioritario

### Fase 1: Seguridad Crítica (Inmediato)

1. **Fix Rate Limiting**
   - Implementar rate limiting en Supabase (usar tabla + RPC)
   - O usar Upstash Redis (gratis hasta 10,000 requests/día)

2. **Mejorar CSP**
   - Remover `'unsafe-inline'`
   - Implementar nonces para scripts inline
   - Agregar `strict-dynamic`

3. **Agregar CORS**
   - Configurar CORS restrictivo en API routes
   - Solo permitir el dominio propio

### Fase 2: Headers de Seguridad (Esta semana)

4. **Agregar headers faltantes:**
   - HSTS (Strict-Transport-Security)
   - Permissions-Policy
   - Referrer-Policy más estricto

### Fase 3: Considerar Upgrade (Próximo mes)

5. **Evaluar Vercel Pro:**
   - WAF integrado
   - Rate limiting en edge
   - Mayor tiempo de ejecución
   - Soporte prioritario

---

## 💰 Costos de Upgrade

| Servicio | Plan Actual | Recomendado | Costo |
|----------|-------------|-------------|-------|
| Vercel | Free | Pro ($20/mes) | $20/mes |
| Upstash Redis | - | Free tier | $0 |
| Supabase | Free | Free (suficiente) | $0 |
| **Total** | | | **$20/mes** |

---

## 🎯 Conclusión

**El proyecto tiene vulnerabilidades de seguridad significativas** principalmente por:

1. Rate limiting inefectivo en arquitectura serverless
2. CSP permisivo que permite XSS
3. Falta de CORS en API

**Recomendación:** Implementar los fixes de la Fase 1 inmediatamente. Considerar upgrade a Vercel Pro si el tráfico crece o se manejan datos sensibles.

**Nivel de riesgo actual:** 🔴 **ALTO** para producción pública
