'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, Clock3, ExternalLink, Eye, Link2, LockKeyhole, RefreshCw, ShieldCheck, Target, Users } from 'lucide-react';
import { CONNECTION_CHECKS, DECISIONS, PROVIDERS } from '@/lib/measurement/definitions';
import { PROVIDER_IDS, type DecisionStatus, type MeasurementCommand, type MeasurementDashboard, type MeasurementReading, type ProviderConnection, type ProviderId } from '@/lib/measurement/types';
import styles from './measurement.module.css';

type CredentialProvider = 'cloudflare' | 'database' | 'google-ads';
type View = 'overview' | 'connections' | 'tracking' | 'learn';
const format = (value: number | null | undefined, digits = 0) => typeof value === 'number' ? value.toLocaleString('es-AR', { maximumFractionDigits: digits }) : 'Sin dato';
const date = (value: string) => new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const collectedDate = (value: string) => new Date(value).toLocaleString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' });
const period = (reading?: MeasurementReading) => reading ? `${date(reading.period.start)} — ${date(reading.period.end)}` : 'Sin período verificado';
const days = (reading?: MeasurementReading) => reading ? Math.round((Date.parse(reading.period.end) - Date.parse(reading.period.start)) / 86400000) + 1 : null;
const origin = (reading?: MeasurementReading) => !reading ? 'Sin lectura' : reading.origin === 'audit' ? 'Auditoría · 5 oct 2026' : reading.origin === 'manual' ? 'Carga manual' : 'Consulta de la cuenta';
const sourceLabels: Record<ProviderConnection['state'], string> = { connected: 'Lectura verificada', ready: 'Listo para consultar', needs_setup: 'Falta conectar', manual: 'Revisión en la cuenta', error: 'La consulta falló' };
const metricLabels: Record<string, string> = { users: 'Usuarios', sessions: 'Visitas', views: 'Vistas · revisar duplicación', engagedSessions: 'Visitas con interacción', outboundClicks: 'Clics hacia tiendas', outboundUsers: 'Personas con salidas', budgets: 'Presupuestos', affiliateClicks: 'Clics afiliados', affiliateViews: 'Vistas afiliadas', contactIntents: 'Clics de contacto', clicks: 'Clics desde Google', impressions: 'Apariciones en Google', ctr: '% de clics', position: 'Posición media', previousClicks: 'Clics · 28 días anteriores', requests: 'Solicitudes registradas', errors: 'Errores registrados', resourceErrors: 'Fallas por recursos', total: 'Ofertas de componentes', observed24h: 'Observadas en 24 h', observed3h: 'Observadas en 3 h', neverAttempted: 'Sin intento registrado', stores: 'Fuentes', storesWithObservations: 'Fuentes con observaciones', criticalAlerts: 'Avisos críticos', warningAlerts: 'Avisos de atención', runs: 'Ejecuciones de la muestra', successful: 'Finalizadas con éxito', failed: 'Fallidas', inProgress: 'En curso', offers: 'Ofertas del feed', http500: 'Errores HTTP 500', canceledQueries: 'Consultas canceladas', approved: 'Sitio aprobado', earningsARS: 'Ingresos · ARS', campaigns: 'Campañas verificadas', spendARS: 'Gasto · ARS' };
const metricValue = (key: string, value: number | null) => value === null ? 'Sin dato' : key === 'approved' ? value === 1 ? 'Sí' : 'No' : format(value, key === 'ctr' || key === 'position' || key.endsWith('ARS') ? 2 : 0);

function Source({ reading }: { reading?: MeasurementReading }) {
  return <div className={styles.source}><Clock3 size={13} aria-hidden="true" /><span>{origin(reading)}{reading && reading.origin !== 'audit' ? ` · leída ${collectedDate(reading.collectedAt)} · hora de Chile` : ''}</span></div>;
}

function DailyChart({ reading }: { reading: MeasurementReading }) {
  const id = useId();
  const daily = reading.daily ?? [];
  if (!daily.length) return <p className={styles.muted}>No hay una serie diaria en esta lectura. Actualizá Analytics para consultarla.</p>;
  const maximum = Math.max(1, ...daily.map((item) => item.value));
  const width = 600 / daily.length;
  return <>
    <svg className={styles.chart} viewBox="0 0 640 180" role="img" aria-labelledby={`${id}-title ${id}-desc`}>
      <title id={`${id}-title`}>Personas medidas cada día</title>
      <desc id={`${id}-desc`}>{daily.map((item) => `${date(item.date)}: ${item.value}`).join('. ')}. Una persona puede aparecer en más de un día.</desc>
      {[0, 1, 2].map((line) => <line key={line} x1="20" x2="620" y1={25 + line * 60} y2={25 + line * 60} className={styles.chartGrid} />)}
      {daily.map((item, index) => <g key={item.date}>
        <rect x={20 + index * width + width * 0.23} y={145 - item.value / maximum * 110} width={width * 0.54} height={Math.max(1, item.value / maximum * 110)} className={styles.chartBar} />
        <text x={20 + index * width + width / 2} y={Math.max(15, 135 - item.value / maximum * 110)} textAnchor="middle" className={styles.chartValue}>{item.value}</text>
        <text x={20 + index * width + width / 2} y="170" textAnchor="middle" className={styles.chartLabel}>{Number(item.date.slice(-2))}/{Number(item.date.slice(5, 7))}</text>
      </g>)}
    </svg>
    <p className={styles.small}>Una persona puede volver varios días. Sumar las barras no da usuarios únicos de la semana.</p>
    <details className={styles.chartTable}><summary>Ver cantidades por día</summary><table><caption>Usuarios medidos por día · {period(reading)}</caption><thead><tr><th scope="col">Día</th><th scope="col">Usuarios</th></tr></thead><tbody>{daily.map((item) => <tr key={item.date}><td>{date(item.date)}</td><td>{format(item.value)}</td></tr>)}</tbody></table></details>
  </>;
}

function Metric({ title, value, unit, explanation, reading, icon }: { title: string; value: string; unit: string; explanation: string; reading?: MeasurementReading; icon: React.ReactNode }) {
  return <article className={styles.metric}>
    <div className={styles.metricTitle}>{icon}<h2>{title}</h2></div>
    <div className={styles.metricValue}>{value}</div><p className={styles.unit}>{unit}</p>
    <p className={styles.metricExplanation}>{explanation}</p>
    <div className={styles.metricFooter}><span>{period(reading)}{reading?.period.timeZone === 'UTC' ? ' · UTC' : ''}</span><Source reading={reading} /></div>
  </article>;
}

export function MeasurementDashboardView({ initialDashboard, googleResult }: { initialDashboard: MeasurementDashboard; googleResult?: string }) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [view, setView] = useState<View>('overview');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(googleResult === 'connected' ? 'Google fue autorizado. Pulsá Actualizar lecturas para verificar los informes y guardarlos.' : '');
  const [error, setError] = useState(googleResult && googleResult !== 'connected' ? 'Google no se conectó. La autorización fue cancelada, venció o no pudo guardarse. Volvé a intentarlo desde tu sesión de administrador.' : '');
  const [search, setSearch] = useState('');
  const [credentialProvider, setCredentialProvider] = useState<CredentialProvider>('cloudflare');
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const dialog = useRef<HTMLDialogElement>(null);
  const firstDialogField = useRef<HTMLInputElement>(null);
  const byId = (id: ProviderId) => dashboard.readings.find((reading) => reading.provider === id);
  const ga4 = byId('ga4'), gsc = byId('search-console'), catalog = byId('catalog'), cloudflare = byId('cloudflare');
  const measured = dashboard.readings.filter((reading) => reading.origin === 'api').length;
  const verified = dashboard.connections.filter((connection) => connection.state === 'connected').length;
  const coverage = catalog && catalog.metrics.total && typeof catalog.metrics.observed24h === 'number' ? catalog.metrics.observed24h / catalog.metrics.total * 100 : null;
  const resourceErrors = cloudflare?.metrics.resourceErrors;
  const errorRate = cloudflare?.metrics.requests && typeof cloudflare.metrics.resourceErrors === 'number' ? cloudflare.metrics.resourceErrors / cloudflare.metrics.requests * 100 : null;

  async function reloadSaved() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/admin/measurement', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error('No se pudieron leer los datos guardados.');
      setDashboard(result); setMessage('Datos guardados recargados. La fecha de cada fuente indica cuándo se consultó su cuenta.');
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudieron leer los datos guardados.'); }
    finally { setBusy(false); }
  }

  async function submit(command: MeasurementCommand | Record<string, unknown>) {
    setBusy(true); setMessage(''); setError('');
    try {
      const response = await fetch('/api/admin/measurement', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'No se pudo guardar la lectura.');
      setDashboard(result.dashboard); setMessage(result.message);
      return true;
    } catch (err) { setError(err instanceof Error ? err.message : 'La consulta falló. Volvé a intentar.'); return false; }
    finally { setBusy(false); }
  }

  function openConnection(id: CredentialProvider) {
    setCredentialProvider(id);
    setCredentials(id === 'cloudflare' ? { accountId: '', worker: 'comparador-hardware-argentina', token: '' } : id === 'google-ads' ? { customerId: '5796164752', developerToken: '' } : { token: '' });
    setError(''); dialog.current?.showModal(); firstDialogField.current?.focus();
  }
  async function connectGoogle(id: ProviderId) {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/measurement/google/start', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'No se pudo abrir Google.');
      window.location.assign(result.url);
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo abrir Google.'); setBusy(false); }
  }
  async function saveConnection() {
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/measurement/connections', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: credentialProvider, ...credentials }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'No se pudo verificar la conexión.');
      setDashboard(result.dashboard); setMessage(result.message); setCredentials({}); dialog.current?.close();
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo verificar la conexión.'); }
    finally { setBusy(false); }
  }

  const tabs: { id: View; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Resumen', icon: <Eye size={17} /> }, { id: 'connections', label: 'Conexiones', icon: <Link2 size={17} /> },
    { id: 'tracking', label: 'Mi seguimiento', icon: <Target size={17} /> }, { id: 'learn', label: 'Entender los datos', icon: <BookOpen size={17} /> },
  ];

  return <div className={styles.root}>
    <div className={styles.container}>
      <div className={styles.breadcrumb}><Link href="/admin">Administración</Link><ChevronRight size={14} aria-hidden="true" /><span>Seguimiento</span><span className={styles.private}><LockKeyhole size={13} aria-hidden="true" /> Sólo administradores</span></div>
      {dashboard.demo && <p className={styles.demo}>Vista local de prueba: las actualizaciones usan fuentes simuladas y el guardado es temporal. {dashboard.demoBaselineReal ? 'Las lecturas marcadas «Auditoría» provienen de la revisión del 5/10.' : 'Todos los datos de esta vista son simulados.'}</p>}
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>COMPARADOR · CENTRO DE DECISIONES</p><h1>Tu proyecto, en claro.</h1><p className={styles.intro}>Qué pasa en la página, qué falta comprobar y qué conviene hacer después.</p></div>
        <button className={styles.primaryButton} onClick={() => void submit({ action: 'sync', provider: 'all' })} disabled={busy || !dashboard.storage.available}><RefreshCw size={17} className={busy ? styles.spinning : ''} aria-hidden="true" />{busy ? 'Solicitando…' : 'Actualizar lecturas'}</button>
      </header>
      {dashboard.setup.externalCollector && <section className={styles.panel} aria-label="Actualización sin sobrecargar la página"><p>Las cuentas se consultan una vez al día fuera del servidor de la web. «Actualizar lecturas» solicita otra consulta y puede tardar unos minutos. Abrir o recargar este panel sólo lee los resultados guardados.</p><button className={styles.secondaryButton} onClick={() => void reloadSaved()} disabled={busy}>Recargar datos guardados</button><p className={styles.small}>Cada cifra conserva el período medido y la hora de su última lectura válida. Si una consulta falla, se conserva el dato anterior; una tarea diaria retrasada no cambia su fecha.</p></section>}
      <div className={styles.reliability}><ShieldCheck size={20} aria-hidden="true" /><p><strong>{verified} de {dashboard.connections.length} fuentes con lectura verificada.</strong> {measured ? `${measured} conservan una consulta guardada con su fecha.` : 'Todavía no hay consultas de cuentas guardadas.'} Revisá en Conexiones los errores y las autorizaciones pendientes.</p><button className={styles.textButton} onClick={() => setView('connections')}>Ver conexiones <ArrowRight size={15} aria-hidden="true" /></button></div>
      {!dashboard.storage.available && <p role="alert" className={styles.warning}><CircleAlert size={17} aria-hidden="true" />{dashboard.storage.issue} Las decisiones no se podrán guardar hasta resolverlo.</p>}
      <div aria-live="polite" aria-atomic="true">{message && <p className={styles.success}><Check size={17} aria-hidden="true" />{message}</p>}</div>
      {error && !dialog.current?.open && <p role="alert" className={styles.warning}>{error}</p>}
      <nav className={styles.tabs} aria-label="Vistas del seguimiento">{tabs.map((tab) => <button key={tab.id} onClick={() => setView(tab.id)} aria-pressed={view === tab.id} className={view === tab.id ? styles.activeTab : ''}>{tab.icon}{tab.label}</button>)}</nav>

      {view === 'overview' && <div className={styles.view}>
        <section className={styles.attention} aria-labelledby="attention-title">
          <div className={styles.attentionIcon}><CircleAlert size={23} aria-hidden="true" /></div>
          <div><p className={styles.eyebrow}>LO QUE MERECE TU ATENCIÓN</p><h2 id="attention-title">{typeof resourceErrors === 'number' && resourceErrors > 0 ? 'Comprobá las fallas antes de buscar más visitas.' : 'Primero comprobá la calidad del servicio y de los datos.'}</h2><p>{typeof resourceErrors === 'number' && resourceErrors > 0 ? `La lectura de Cloudflare del ${date(cloudflare!.period.end)} registró ${format(resourceErrors)} fallas por límite de recursos. La cobertura de ofertas fue ${format(coverage, 1)}% en su propio corte.` : 'Revisá las conexiones pendientes, las ofertas recientes y los problemas encontrados en la auditoría.'} <strong>Esto no confirma una falla actual ni su reparación.</strong></p></div>
          <button className={styles.secondaryButton} onClick={() => setView('tracking')}>Elegir el siguiente paso <ArrowRight size={16} aria-hidden="true" /></button>
        </section>
        <section className={styles.metrics} aria-label="Indicadores principales">
          <Metric title="Personas que llegan" value={format(ga4?.metrics.users)} unit={days(ga4) ? `usuarios medidos en ${days(ga4)} días` : 'usuarios medidos'} explanation="Personas que Analytics pudo medir. Una persona puede hacer varias visitas." reading={ga4} icon={<Users size={18} aria-hidden="true" />} />
          <Metric title="Llegadas desde Google" value={format(gsc?.metrics.clicks)} unit={days(gsc) ? `clics desde búsquedas en ${days(gsc)} días` : 'clics desde búsquedas'} explanation="Clics en resultados de Google. Tiene otro período y otra forma de contar." reading={gsc} icon={<ArrowRight size={18} aria-hidden="true" />} />
          <Metric title="Ofertas revisadas" value={coverage === null ? 'Sin dato' : `${format(coverage, 1)}%`} unit="de componentes observados en 24 h" explanation={catalog ? `${format(catalog.metrics.observed24h)} de ${format(catalog.metrics.total)} ofertas. Precio reciente no equivale a stock.` : 'Necesitamos una lectura de cobertura.'} reading={catalog} icon={<RefreshCw size={18} aria-hidden="true" />} />
          <Metric title="Fallas del servidor" value={format(resourceErrors)} unit="invocaciones con límite de recursos" explanation={errorRate === null ? 'No hay una proporción verificable.' : `${format(errorRate, 2)}% de ${format(cloudflare?.metrics.requests)} invocaciones. No es el porcentaje de visitantes afectados.`} reading={cloudflare} icon={<CircleAlert size={18} aria-hidden="true" />} />
        </section>
        <div className={styles.twoColumns}>
          <section className={styles.panel}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>AUDIENCIA</p><h2>¿Cuánta gente llega cada día?</h2><p>{period(ga4)} · usuarios medidos cada día</p></div><Source reading={ga4} /></div>{ga4 ? <DailyChart reading={ga4} /> : <p>Autorizá Analytics para ver la serie diaria.</p>}</section>
          <section className={styles.panel}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>ORIGEN DE LAS VISITAS</p><h2>¿Por dónde llegan?</h2><p>{period(ga4)} · sesiones, no personas únicas</p></div></div><div className={styles.channels}>{(ga4?.breakdown ?? []).map((row) => <div key={row.label} className={styles.channel}><div><span>{row.label === '(direct) / (none)' ? 'Directo / origen no identificado' : row.label === 'google / organic' ? 'Google · búsquedas' : row.label}</span><strong>{format(row.value)}</strong></div><progress value={row.value} max={Math.max(1, ga4?.metrics.sessions ?? row.value)} aria-label={`${row.label}: ${row.value} sesiones`} /></div>)}</div><p className={styles.small}>“Directo” puede incluir un origen no identificado. “google / cpc” no confirma que hubo gasto en publicidad.</p></section>
        </div>
        <section className={styles.panel}><div className={styles.sectionHeading}><div><p className={styles.eyebrow}>USO DEL COMPARADOR</p><h2>¿Qué hacen después de llegar?</h2></div><Source reading={ga4} /></div>{ga4?.metrics.outboundClicks != null ? <div className={styles.behavior}><div><strong>{format(ga4.metrics.outboundClicks)}</strong><span>salidas hacia tiendas</span></div><div><strong>{format(ga4.metrics.budgets)}</strong><span>presupuestos generados</span></div><div><strong>{format(ga4.metrics.affiliateClicks)}</strong><span>clics afiliados</span></div></div> : <p>{ga4?.notes.find((note) => note.startsWith('Otro período:')) ?? 'Falta una lectura de las acciones dentro del comparador.'}</p>}<p className={styles.small}>Los clics hacia tiendas y los presupuestos muestran cómo se usa el comparador. Las tiendas gestionan las compras. Los ingresos por publicidad y comisiones se consultan por separado.</p></section>
        <div className={styles.bottomLink}><p>Una cifra aislada no alcanza para decidir. Revisá la fuente, las fechas y el problema que querés resolver.</p><button className={styles.textButton} onClick={() => setView('learn')}>Entender cada métrica <ArrowRight size={16} aria-hidden="true" /></button></div>
      </div>}

      {view === 'connections' && <section className={styles.view} aria-labelledby="connections-title">
        <div className={styles.sectionHeading}><div><h2 id="connections-title">Tus fuentes de datos, en un lugar.</h2><p>La cuenta puede existir y estar midiendo aunque este panel todavía necesite su autorización.</p></div><label className={styles.searchLabel}>Buscar conexión<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Google, precios, errores…" /></label></div>
        <div className={styles.connectionGrid}>{PROVIDER_IDS.filter((id) => `${PROVIDERS[id].name} ${PROVIDERS[id].purpose}`.toLowerCase().includes(search.toLowerCase())).map((id) => {
          const provider = PROVIDERS[id], connection = dashboard.connections.find((item) => item.id === id)!, reading = byId(id);
          return <article key={id} className={styles.connectionCard}>
            <div className={styles.connectionTitle}><h3>{provider.name}</h3><span className={`${styles.status} ${connection.state === 'connected' ? styles.positive : connection.state === 'error' ? styles.negative : styles.neutral}`}><span aria-hidden="true">{connection.state === 'connected' ? '✓' : connection.state === 'error' ? '!' : '○'}</span> {sourceLabels[connection.state]}</span></div>
            <p>{provider.purpose}</p><p className={styles.small}>{provider.scope}</p><Source reading={reading} />
            {reading && <p className={styles.small}>Datos: {period(reading)} · {reading.period.timeZone}</p>}
            {connection.checkedAt && <p className={styles.small}>Último intento: {collectedDate(connection.checkedAt)} · hora de Chile. La fecha de la lectura válida figura arriba.</p>}
            {reading && <dl className={styles.connectionMetrics}>{Object.entries(reading.metrics).map(([key, value]) => <div key={key}><dt>{metricLabels[key] ?? key}</dt><dd>{metricValue(key, value)}</dd></div>)}</dl>}
            {id === 'adsense' && reading && <><p className={styles.small}>{reading.notes[0]}</p>{reading.metrics.earningsARS === null && <p className={styles.small}>Google todavía no informó ingresos para este período.</p>}</>}
            {connection.issue && <p className={styles.connectionIssue}>{connection.issue}</p>}
            {['ga4', 'search-console', 'adsense', 'google-ads'].includes(id) && !dashboard.setup.google && <p className={styles.small}>La autorización existente permite consultar los datos guardados. Para renovarla desde esta página falta habilitar la autorización de Google para el dominio público.</p>}
            <div className={styles.connectionActions}>
              <a className={styles.textButton} href={provider.url} target={provider.url.startsWith('https:') ? '_blank' : undefined} rel={provider.url.startsWith('https:') ? 'noopener noreferrer' : undefined}>Abrir {id === 'catalog' || id === 'operations' ? 'detalle' : 'cuenta'} <ExternalLink size={14} aria-hidden="true" /></a>
              {['ga4', 'search-console', 'adsense', 'google-ads'].includes(id) && <button className={styles.secondaryButton} onClick={() => void connectGoogle(id)} disabled={busy || !dashboard.storage.available || !dashboard.setup.google || !dashboard.setup.encryption}>Autorizar Google{id === 'google-ads' ? ' Ads' : ''}</button>}
              {['cloudflare', 'database', 'google-ads'].includes(id) && <button className={styles.secondaryButton} onClick={() => openConnection(id as CredentialProvider)} disabled={busy || !dashboard.storage.available || !dashboard.setup.encryption}>{id === 'google-ads' ? 'Añadir token de Ads' : 'Configurar acceso'}</button>}
              <button className={styles.secondaryButton} onClick={() => void submit({ action: 'sync', provider: id })} disabled={busy || !dashboard.storage.available || connection.state === 'needs_setup'}>Actualizar lectura</button>
            </div>
            <details className={styles.setup}><summary>{connection.state === 'needs_setup' ? 'Cómo conectar esta fuente' : 'Qué incluye esta conexión'}</summary><ol>{provider.setup.map((step) => <li key={step}>{step}</li>)}</ol>{reading?.notes.map((note) => <p key={note} className={styles.small}>{note}</p>)}</details>
          </article>;
        })}</div>
        {!PROVIDER_IDS.some((id) => `${PROVIDERS[id].name} ${PROVIDERS[id].purpose}`.toLowerCase().includes(search.toLowerCase())) && <p className={styles.panel}>No se encontraron conexiones con ese texto.</p>}
        <section className={styles.panel}><div className={styles.sectionHeading}><div><h2>Otros controles de la auditoría</h2><p>Estados comprobados el 5/10/2026. No se actualizan ni se corrigen al pulsar Actualizar lecturas.</p></div></div><div className={styles.checks}>{CONNECTION_CHECKS.map((item) => <div key={item.name}><h3>{item.name}</h3><span className={styles.small}>{item.status}</span><p>{item.detail}</p></div>)}</div></section>
        <section className={styles.panel}><h2>Conectar sin compartir tus claves</h2><p>Google abre su propia pantalla para autorizar Analytics, Search Console y AdSense con permisos de lectura. Google Ads necesita un permiso aparte y un token de desarrollador aprobado.</p><p>Cloudflare y los logs de Supabase usan una autorización privada que ingresás en este panel. Se cifra antes de guardarla y no vuelve a mostrarse. Creá permisos de lectura limitados al proyecto. No mandes claves por el chat.</p><p className={styles.small}>Catálogo, registro operativo, feed y tareas de GitHub se consultan desde las conexiones existentes. Un error conserva el dato anterior con su fecha; nunca se reemplaza por un cero inventado.</p></section>
      </section>}

      {view === 'tracking' && <section className={styles.view} aria-labelledby="tracking-title">
        <div className={styles.sectionHeading}><div><h2 id="tracking-title">Un próximo paso, con evidencia.</h2><p>Guardá qué estás revisando. Los indicadores sólo cambian cuando llega una nueva lectura.</p></div></div>
        <div className={styles.decisions}>{DECISIONS.map((decision, index) => {
          const tracked = dashboard.decisions.find((item) => item.id === decision.id), reading = byId(decision.provider);
          return <article key={decision.id} className={styles.decision}><span className={styles.decisionNumber}>{String(index + 1).padStart(2, '0')}</span><div><p className={styles.eyebrow}>{decision.priority}</p><h3>{decision.title}</h3><p>{decision.why}</p><div className={styles.nextStep}><strong>Siguiente paso</strong><p>{decision.action}</p></div><Source reading={reading} />{tracked && <p className={styles.small}>Estado guardado el {date(tracked.updatedAt)}. No confirma resolución.</p>}</div><label className={styles.decisionSelect}>Mi estado<select value={tracked?.status ?? 'pending'} disabled={busy || !dashboard.storage.available} onChange={(event) => void submit({ action: 'decision', id: decision.id, status: event.target.value as DecisionStatus })}><option value="pending">Pendiente</option><option value="in_progress">En revisión</option><option value="done">Revisado</option></select></label></article>;
        })}</div>
        <section className={styles.panel}><h2>Historial de lecturas</h2><p>Hasta 80 lecturas visibles, con sus primeras tres cifras. Compará la misma fuente y períodos equivalentes. El historial se guarda en la base de datos privada y permanece después de reiniciar el servidor. Cada período conserva su último corte; no se inventa un histórico anterior.</p><div className={styles.tableScroll}><table><thead><tr><th scope="col">Fuente</th><th scope="col">Período</th><th scope="col">Cifras del corte</th><th scope="col">Origen</th><th scope="col">Leída</th></tr></thead><tbody>{dashboard.history.map((reading, index) => <tr key={`${reading.provider}-${reading.period.end}-${reading.collectedAt}-${index}`}><th scope="row">{PROVIDERS[reading.provider].name}</th><td>{period(reading)}</td><td><ul className={styles.historyMetrics}>{Object.entries(reading.metrics).slice(0, 3).map(([key, value]) => <li key={key}>{metricLabels[key] ?? key}: <strong>{metricValue(key, value)}</strong></li>)}</ul></td><td>{origin(reading)}</td><td>{date(reading.collectedAt)}</td></tr>)}</tbody></table></div></section>
        <p className={styles.small}>{dashboard.setup.externalCollector ? 'La tarea diaria consulta las fuentes aunque el panel esté cerrado. Actualizar solicita una tarea externa; recargar sólo lee lo guardado.' : 'Actualizar consulta las fuentes autorizadas y guarda cortes.'} No envía avisos ni dispara actualizaciones de precios.</p>
      </section>}

      {view === 'learn' && <section className={styles.view} aria-labelledby="learn-title">
        <div><p className={styles.eyebrow}>SIN PALABRAS RARAS</p><h2 id="learn-title">Lo necesario para tomar una decisión.</h2><p className={styles.intro}>No necesitás aprender todos los informes. Empezá por estas cuatro preguntas.</p></div>
        <div className={styles.lessonGrid}>{[
          ['1', '¿Cuánta gente llega?', 'Usuarios son personas medidas; sesiones son visitas. Una persona puede visitar varias veces. Mirá períodos completos y la misma forma de medir.', 'Usalo para saber si crece la audiencia, después de revisar consentimiento y tráfico de pruebas.'],
          ['2', '¿Cómo me encuentran?', 'Search Console cuenta clics desde Google. Analytics observa visitas dentro de tu página. Sus cifras y sus fechas pueden diferir.', 'Muchas apariciones y pocos clics: revisar el título y la propuesta de esa página.'],
          ['3', '¿Les sirve la página?', 'Un clic hacia una tienda o un presupuesto armado ayudan a ver si el comparador resulta útil. Un “evento” es una acción registrada dentro de la página.', 'Compará presupuestos y clics hacia tiendas del mismo período para saber si las personas encuentran opciones útiles.'],
          ['4', '¿La página funciona bien?', 'Cloudflare ve fallas del servidor; Supabase ve errores de datos. La cobertura indica ofertas observadas, no stock confirmado.', 'Si hay errores o precios viejos, priorizá recuperar el servicio antes de aumentar la promoción.'],
        ].map(([number, title, explanation, action]) => <article className={styles.lesson} key={number}><span className={styles.lessonNumber}>{number}</span><h3>{title}</h3><p>{explanation}</p><p className={styles.nextStep}><strong>Qué podés decidir</strong><br />{action}</p></article>)}</div>
        <section className={styles.panel}><h2>Cómo leer los avisos</h2><dl className={styles.glossary}><div><dt>Consulta de la cuenta</dt><dd>La fuente respondió y el panel guardó la lectura. Comprobá su período: no siempre incluye hoy.</dd></div><div><dt>Lectura anterior</dt><dd>Es el último dato válido que guardamos. Si la fuente falla, conserva su fecha original; pulsar Actualizar no lo vuelve reciente.</dd></div><div><dt>Falta autorización</dt><dd>El servicio puede estar funcionando, pero la página no tiene acceso de lectura. Autorizar no significa contratar ni cambiar campañas.</dd></div><div><dt>Sin dato</dt><dd>No sabemos ese valor. Es diferente de cero, que indica una consulta válida sin resultados para esa métrica.</dd></div><div><dt>Período y porcentaje</dt><dd>Un porcentaje necesita un total y una ventana. Compará períodos equivalentes: siete días de Analytics y 28 de Google responden a preguntas diferentes.</dd></div></dl></section>
        <section className={styles.rule}><BookOpen size={22} aria-hidden="true" /><div><h3>La rutina simple</h3><p>Actualizá las lecturas, comprobá fallas y ofertas, elegí un siguiente paso y guardá su estado. Una vez por semana, compará cortes equivalentes. No saques conclusiones fuertes de pocos usuarios.</p></div></section>
      </section>}
      <footer className={styles.footer}><span>Privado · lecturas con fecha · decisiones verificables</span><Link href="/admin">Volver a administración <ArrowRight size={14} aria-hidden="true" /></Link></footer>
    </div>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="connection-title" onClose={() => { setCredentials({}); setError(''); }}>
      <h2 id="connection-title">Conectar {PROVIDERS[credentialProvider].name}</h2>
      <p>La autorización se envía al servidor del proyecto y se guarda cifrada. Usá permisos de lectura; no ingreses tu contraseña de la cuenta.</p>
      {credentialProvider === 'cloudflare' && <><p>En Cloudflare, creá un token con Account Analytics: Read para tu cuenta. Copiá el identificador de cuenta del panel de Cloudflare y el nombre del Worker.</p><label>Identificador de cuenta<input ref={firstDialogField} autoComplete="off" value={credentials.accountId ?? ''} onChange={(event) => setCredentials({ ...credentials, accountId: event.target.value.trim() })} /></label><label>Nombre del Worker<input autoComplete="off" value={credentials.worker ?? ''} onChange={(event) => setCredentials({ ...credentials, worker: event.target.value.trim() })} /></label></>}
      {credentialProvider === 'database' && <p>Usá un token de la cuenta de Supabase con lectura de logs, no la clave pública ni la clave de la base. Se consultará solamente el proyecto Comparador.</p>}
      {credentialProvider === 'google-ads' && <><p>El token de desarrollador debe estar aprobado para la cuenta real. También necesitás pulsar Autorizar Google Ads en la conexión.</p><label>Número de cuenta<input ref={firstDialogField} autoComplete="off" inputMode="numeric" value={credentials.customerId ?? ''} onChange={(event) => setCredentials({ ...credentials, customerId: event.target.value.replace(/\D/g, '') })} /></label></>}
      <label>{credentialProvider === 'google-ads' ? 'Token de desarrollador' : 'Token de lectura'}<input ref={credentialProvider === 'database' ? firstDialogField : undefined} type="password" autoComplete="new-password" spellCheck={false} maxLength={4096} value={credentials[credentialProvider === 'google-ads' ? 'developerToken' : 'token'] ?? ''} onChange={(event) => setCredentials({ ...credentials, [credentialProvider === 'google-ads' ? 'developerToken' : 'token']: event.target.value.trim() })} /></label>
      {error && <p role="alert" className={styles.warning}>{error}</p>}
      <div className={styles.dialogActions}><button className={styles.secondaryButton} onClick={() => dialog.current?.close()} disabled={busy}>Cancelar</button><button className={styles.primaryButton} onClick={() => void saveConnection()} disabled={busy || !credentials[credentialProvider === 'google-ads' ? 'developerToken' : 'token']}>{busy ? 'Verificando…' : 'Guardar y verificar'}</button></div>
    </dialog>
  </div>;
}
