FROM node@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Sólo claves públicas de Auth en el build; los secretos del catálogo se montan al arrancar.
ENV NEXT_PUBLIC_SUPABASE_URL=https://zyiyziubpcpgoqlkcrie.supabase.co \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YarIgxU8K--eKMJMsRrB6g_Ka-7xj40 \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_YarIgxU8K--eKMJMsRrB6g_Ka-7xj40 \
    NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-7BHXTCQFTP \
    SITE_URL=https://www.comparador-hardware.com.ar \
    DISABLE_INTERNAL_BACKGROUND_REFRESH=1 DISABLE_LIVE_SCRAPING=1 ENABLE_ON_DEMAND_REFRESH=0
RUN npm run build

FROM node@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 WRANGLER_SEND_METRICS=false
COPY --from=build --chown=node:node /app /app
# El runner crea su bundle temporal dentro del checkout.
RUN chown node:node /app
USER node
EXPOSE 3100
CMD ["node", "scripts/vps/catalog-server.mjs"]
