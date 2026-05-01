# Bundle Optimization Report

**Date:** March 21, 2026  
**Project:** comparador-hardware-argentina  
**Build Tool:** Next.js 16.1.6 (Turbopack default, Webpack analyzed)

---

## 1. Problematic Chunks Identified

### Turbopack Build (Original Sizes Reported)
| Chunk Hash | Size (KB) | Size (bytes) |
|------------|-----------|--------------|
| aee6c7720838f8a2 | 224 | 229,376 |
| cd93ee4e82737ea5 | 192 | 196,608 |
| e864a5851b34397f | 123 | 125,952 |
| a6dad97d9634a72d | 112 | 114,688 |

### Webpack Build (Current Analysis)
| Chunk | Size (KB) | Contents |
|-------|-----------|----------|
| 4bd1b696-bf5e0dbacfa5baef | 194 | react-dom |
| 1958-35a54f1923f395af | 187 | @supabase/supabase-js |
| framework-a7f7b4d2dfa5296c | 185 | Next.js framework |
| 3794-cd98b5cd5fb65b19 | 184 | @swc/helpers + modules |
| main-0b19032e36814f7f | 125 | Main application code |
| polyfills-42372ed130431b0a | 110 | Polyfills |

---

## 2. Packages Responsible for Large Chunks

### @supabase/supabase-js
- **node_modules size:** ~15MB (installed), ~568KB (bundled in Turbopack)
- **Webpack bundled size:** ~191KB (parsed: ~168KB)
- **Gzip size:** ~50KB
- **Analysis:** Large but necessary for database operations. Contains @supabase/postgrest-js, @supabase/realtime-js, @supabase/auth-js, gotrue-js, storage-js, realtime-core

### react-dom
- **Webpack bundled size:** ~194KB (parsed: ~198KB)
- **Gzip size:** ~62KB
- **Analysis:** Expected size for React 19. Cannot be reduced without reducing React usage.

### Next.js Framework
- **Bundled size:** ~185KB
- **Analysis:** Standard Next.js framework chunk. Expected for Next.js 16.

### @swc/helpers
- **Bundled size:** ~184KB
- **Analysis:** SWC compiler helpers. Heavy but necessary for transpilation.

### @google/genai (12MB installed, NOT in client bundle)
- **node_modules size:** 12MB
- **Analysis:** Used only in server-side code (`src/lib/ai/normalize/`). **NOT included in client bundles**. Only bundled in server chunks (~858KB in dev). This is expected behavior - library should only run on server.

### recharts (7.8MB installed, NOT used)
- **node_modules size:** 7.8MB
- **Usage in code:** NONE FOUND
- **Analysis:** **DEAD WEIGHT** - Package is installed but never imported in any source file. Should be removed.

---

## 3. Chunk Content Analysis

### Chunk 1958 (@supabase)
```
@supabase/supabase-js (553KB)
├── @supabase/supabase-js (16KB)
├── @supabase/postgrest-js (48KB)
├── @supabase/realtime-js (97KB)
├── @supabase/gotrue-js (122KB)
├── @supabase/storage-js (14KB)
├── @supabase/realtime-core (38KB)
├── @supabase/auth-helpers (69KB)
├── postgrest-js (26KB)
├── ... (other dependencies)
```

### Chunk 3794 (@swc/helpers + modules)
```
@swc/helpers/esm
node_modules utilities
```

### Large Server Chunks (Dev Only)
- `@google/genai` server chunk: ~858KB (dev server only, not in production client bundle)
- react-dom server chunks: ~1MB each (dev only)

---

## 4. Optimization Recommendations

### CRITICAL - Remove Dead Weight

```bash
# recharts is installed but never used - remove immediately
npm uninstall recharts
```

**Impact:** Saves 7.8MB in node_modules, reduces install time.

### MEDIUM - Dynamic Imports for @supabase

The `@supabase/supabase-js` chunk (~187KB) is large but only needed on specific pages.

**Recommendation:** If Supabase is only used in API routes, verify it's properly tree-shaken. Currently it appears necessary for:
- `/api/search` route
- `/api/products` route  
- Admin pages

**Action:** No immediate action needed unless specific pages are identified as slow.

### LOW - @google/genai Server Optimization

The `@google/genai` library (12MB) is only used server-side for AI title normalization.

**Current Usage:**
- `src/lib/ai/normalize/index.ts` - imports GoogleGenAI
- `src/lib/ai/normalize/gemini.ts` - imports GoogleGenAI
- Used by: `search-live.ts`, `catalog-metadata.ts`

**Issue:** The library initializes `GoogleGenAI` at module load time:
```typescript
const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;
```

**Recommendations:**
1. Keep it server-side only (already correct)
2. Consider lazy initialization if the API key is not set
3. Consider splitting AI code into a separate API route to isolate the chunk

### LOW - Verify Turbopack vs Webpack

The reported chunk sizes (224KB, 192KB, etc.) are from Turbopack build. Turbopack may produce different chunking than Webpack.

**To analyze Turbopack bundles:**
```bash
npm run build  # Uses Turbopack by default in Next.js 16
# Then inspect .next/static/chunks/
```

---

## 5. What is NOT a Problem

### react-dom (194KB)
- **Verdict:** Normal size for React 19
- **Action:** None needed

### Next.js Framework (185KB)
- **Verdict:** Standard framework overhead
- **Action:** None needed

### @google/genai in Client Bundle
- **Verdict:** NOT in client bundle - only in server chunks
- **Action:** None needed (correct behavior)

---

## 6. Summary of Actions

| Priority | Action | Impact | Effort |
|----------|--------|--------|--------|
| **CRITICAL** | Remove `recharts` package | -7.8MB | 1 min |
| **LOW** | Monitor @supabase chunk | None immediate | N/A |
| **LOW** | Consider lazy load AI module | Minimal | Medium |

### Files to Modify

1. **package.json** - Remove `recharts` from dependencies

---

## 7. Next Steps

1. **Execute:** `npm uninstall recharts`
2. **Rebuild:** `npm run build`
3. **Verify:** Chunks sizes reduced
4. **Monitor:** If specific pages are slow, analyze with:
   ```bash
   ANALYZE=true npm run build -- --webpack
   open .next/analyze/client.html
   ```

---

## Appendix: Build Commands Used

```bash
# Install bundle analyzer
npm install --save-dev @next/bundle-analyzer

# Add to next.config.ts
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

# Analyze webpack build
ANALYZE=true npm run build -- --webpack

# Reports saved to
.next/analyze/client.html
.next/analyze/nodejs.html
.next/analyze/edge.html
```
