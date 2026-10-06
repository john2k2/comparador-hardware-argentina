import type { DecisionId, ProviderId } from './types';

export const PROVIDERS: Record<ProviderId, { name: string; purpose: string; url: string; setup: string[]; automatic: boolean; scope: string }> = {
  ga4: {
    name: 'Google Analytics', purpose: 'Cuántas personas llegan y qué hacen dentro de la página.',
    url: 'https://analytics.google.com/analytics/web/#/a407841883p553934279/reports/intelligenthome', automatic: true, scope: 'Últimos 7 días completos · hora de Argentina',
    setup: ['Pulsar Autorizar Google. Google pide lectura de Analytics, Search Console y AdSense.', 'Elegir la cuenta que administra el proyecto y confirmar los permisos en Google.', 'Pulsar Actualizar lectura y comprobar la fecha del resultado.'],
  },
  'search-console': {
    name: 'Google Search Console', purpose: 'Cuántas veces Google te muestra y cuántas personas hacen clic.',
    url: 'https://search.google.com/search-console?resource_id=https%3A%2F%2Fwww.comparador-hardware.com.ar%2F', automatic: true, scope: '28 días · datos finales de Google · hora del Pacífico',
    setup: ['Usar la misma conexión de Google, con acceso de lectura a Search Console.', 'La propiedad debe ser https://www.comparador-hardware.com.ar/.', 'El vínculo con Analytics es otro ajuste de Google: no se crea al actualizar el panel.'],
  },
  cloudflare: {
    name: 'Cloudflare', purpose: 'Si el servidor de la página está respondiendo o tiene fallas.',
    url: 'https://dash.cloudflare.com/', automatic: true, scope: 'Último día completo · UTC · invocaciones del Worker',
    setup: ['Crear una autorización de lectura de estadísticas para la cuenta y el Worker.', 'Guardarla en el servidor con acceso limitado a este proyecto.', 'Las alertas por correo y el rendimiento real del navegador se verifican aparte.'],
  },
  catalog: {
    name: 'Catálogo y precios', purpose: 'Qué proporción de las ofertas se revisó en las últimas 24 horas.',
    url: '/admin/stores', automatic: true, scope: 'Componentes · observaciones reales de las últimas 24 horas',
    setup: ['Usa la conexión privada de Supabase que ya tiene el proyecto.', 'Actualizar lee la cobertura existente; no inicia scraping ni cambia precios.', 'Una observación reciente no garantiza stock ni compatibilidad.'],
  },
  operations: {
    name: 'Búsqueda y tiendas', purpose: 'Fallas registradas al buscar y consultar productos.',
    url: '/admin/alerts', automatic: true, scope: 'Telemetría disponible · /api/search y /api/products · 24 horas',
    setup: ['Usa el registro operativo existente de la aplicación.', 'No cubre todas las páginas ni todos los errores del navegador.', 'Sin registros no se puede afirmar que todo funcionó.'],
  },
  github: {
    name: 'Actualizaciones automáticas', purpose: 'Si las tareas programadas terminaron o fallaron.',
    url: 'https://github.com/john2k2/comparador-hardware-argentina/actions', automatic: true, scope: 'Muestra de hasta 20 ejecuciones de actualización del catálogo',
    setup: ['Consulta el historial público del proyecto en GitHub.', 'Si GitHub limita las consultas, se puede añadir una autorización de lectura en el servidor.', 'Una tarea en verde no demuestra que todas las ofertas se actualizaron.'],
  },
  eneba: {
    name: 'Afiliados · Eneba', purpose: 'Disponibilidad del feed del piloto. Las comisiones se verifican en el informe de Eneba.',
    url: '/juegos-digitales', automatic: true, scope: 'Última lectura del feed privado existente',
    setup: ['Lee el feed ya guardado por el piloto; no activa ni amplía la campaña.', 'Los clics se consultan en Analytics cuando la conexión está autorizada.', 'Los ingresos por comisiones se contrastan con el informe del afiliado.'],
  },
  database: {
    name: 'Supabase · errores de datos', purpose: 'Errores de la base de datos que pueden afectar la página.',
    url: 'https://supabase.com/dashboard/project/zyiyziubpcpgoqlkcrie/logs/explorer', automatic: true, scope: 'Último día completo · UTC · errores de los logs del proyecto',
    setup: ['Pulsar Configurar acceso y agregar un token de Supabase con lectura de logs del proyecto.', 'Guardar y verificar consulta agregados reales, sin datos de visitantes.', 'La clave del catálogo no concede acceso automático a los logs de la cuenta.'],
  },
  adsense: {
    name: 'Google AdSense', purpose: 'Si los anuncios fueron aprobados y cuánto ingreso estima Google.',
    url: 'https://www.google.com/adsense/new/', automatic: true, scope: 'Estado del dominio · ingreso estimado de 7 días en ARS · hora del Pacífico',
    setup: ['Pulsar Autorizar Google con la cuenta de AdSense del proyecto.', 'Actualizar consulta aprobación e ingresos estimados del dominio; no habilita anuncios.', 'Un ingreso estimado no confirma que Google haya pagado.'],
  },
  'google-ads': {
    name: 'Google Ads', purpose: 'Gasto y resultados de campañas, si se decide hacer publicidad.',
    url: 'https://ads.google.com/aw/overview', automatic: true, scope: 'Campañas no eliminadas · gasto de 7 días en ARS · zona de la cuenta',
    setup: ['Pulsar Autorizar Google Ads. Google ofrece un permiso amplio de Ads; el panel sólo ejecuta informes.', 'Añadir el token de desarrollador aprobado para la cuenta real.', 'Actualizar verifica moneda y fechas. No crea campañas ni contrata publicidad.'],
  },
};

export const METRIC_KEYS: Record<ProviderId, readonly string[]> = {
  ga4: ['users', 'sessions', 'views', 'engagedSessions', 'outboundClicks', 'outboundUsers', 'budgets', 'affiliateClicks', 'affiliateViews', 'contactIntents'],
  'search-console': ['clicks', 'impressions', 'ctr', 'position', 'previousClicks'],
  cloudflare: ['requests', 'errors', 'resourceErrors'],
  catalog: ['total', 'observed24h', 'observed3h', 'neverAttempted', 'stores'],
  operations: ['requests', 'errors', 'storesWithObservations', 'criticalAlerts', 'warningAlerts'],
  github: ['runs', 'successful', 'failed', 'inProgress'],
  eneba: ['offers'],
  database: ['http500', 'canceledQueries'],
  adsense: ['approved', 'earningsARS'],
  'google-ads': ['campaigns', 'spendARS'],
};

export const DECISIONS: { id: DecisionId; title: string; why: string; action: string; priority: string; provider: ProviderId }[] = [
  { id: 'stability', title: 'Comprobar que la página responde bien', priority: 'Primero', provider: 'cloudflare', why: 'Si una persona encuentra una falla, aumentar las visitas sólo expone el problema a más gente.', action: 'Contrastar fallas del servidor y de la base de datos; pedir evidencia de recuperación en la auditoría.' },
  { id: 'catalog', title: 'Revisar ofertas que quedaron viejas', priority: 'Después', provider: 'catalog', why: 'El comparador necesita precios revisados. El porcentaje cuenta observaciones reales, aunque la tarea automática termine en verde.', action: 'Revisar cobertura por tienda y recuperar las fuentes con menos observaciones.' },
  { id: 'measurement', title: 'Hacer confiable la medición', priority: 'Después', provider: 'ga4', why: 'La auditoría detectó superposición de vistas y falta de detalles. No conviene decidir por páginas vistas hasta verificarlo.', action: 'Coordinar con la auditoría la corrección de vistas y parámetros de producto; comprobar eventos nuevos.' },
  { id: 'connect', title: 'Autorizar las lecturas del panel', priority: 'Configuración', provider: 'search-console', why: 'Las lecturas guardadas sirven como punto de partida. Para seguir cambios necesitamos nuevas consultas con acceso privado.', action: 'Completar Google y Cloudflare con permisos de lectura, actualizar y revisar el historial.' },
  { id: 'income', title: 'Confirmar ingresos antes de escalar', priority: 'Negocio', provider: 'adsense', why: 'Los clics hacia tiendas y los presupuestos miden el uso del comparador. Los ingresos por publicidad y comisiones se verifican en sus informes.', action: 'Verificar aprobación de AdSense y comisiones atribuibles; registrar gasto e ingresos del mismo período.' },
];

export const CONNECTION_CHECKS = [
  { name: 'Vistas y eventos de Analytics', status: 'Necesita revisión', detail: 'Superposición de vistas detectada; volumen de duplicados sin cuantificar.' },
  { name: 'Detalles de producto y armador', status: 'Incompleto', detail: 'Faltaban dimensiones para distinguir productos y acciones. Validar eventos nuevos tras el ajuste.' },
  { name: 'Search Console → Analytics', status: 'Sin vínculo al corte', detail: 'Revisar y autorizar el vínculo desde Google.' },
  { name: 'Analytics → BigQuery', status: 'Sin vínculo al corte', detail: 'Evaluar sólo si hace falta conservar eventos detallados.' },
  { name: 'Adsense y Google Ads → Analytics', status: 'Vínculos verificados', detail: 'No acreditan aprobación del sitio, campañas activas ni ingresos.' },
  { name: 'Alertas de Cloudflare', status: 'No verificado', detail: 'La autorización de la auditoría no permitió leer políticas ni destinatarios.' },
  { name: 'Rendimiento real del navegador', status: 'No verificado', detail: 'Faltaba confirmar RUM y mediciones de velocidad y errores de visitantes.' },
  { name: 'Logs de Cloudflare', status: 'Parcial', detail: 'Muestreo del 10% al corte; no es un archivo completo de incidentes.' },
  { name: 'Registro operativo persistente', status: 'Parcial', detail: 'Cobertura limitada a dos endpoints; escrituras y conservación requieren revisión.' },
  { name: 'Interés de Analytics → catálogo', status: 'Sin datos al corte', detail: 'El importador existe, pero la tabla de interés estaba vacía.' },
  { name: 'Sitemap, indexación y ads.txt', status: 'Revisión de cuenta', detail: 'Search Console tenía sitemap correcto; ads.txt público respondía. Son cortes, no garantías futuras.' },
  { name: 'Consentimiento y tráfico de pruebas', status: 'Revisar alcance', detail: 'La política cambió el 27/09. No comparar el antes y el después como si midieran lo mismo.' },
  { name: 'Seguimiento diario de Codex', status: 'Existía una tarea local', detail: 'No demuestra vigilancia permanente ni entrega de alertas del sitio.' },
  { name: 'GTM, Sentry, Clarity y otras etiquetas', status: 'No encontradas en el proyecto', detail: 'La auditoría no encontró estas integraciones. No es prueba de ausencia en todas las cuentas externas.' },
] as const;
