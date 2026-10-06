import 'server-only';
import { NextRequest } from 'next/server';
import { authorizeMeasurementRequest, hasSameOrigin, privateJson, readBoundedJson } from './access';
import { saveCredential } from './credentials';
import { executeMeasurementCommand, getMeasurementDashboard } from './service';
import { CollectionRequestError } from './collection';
import { saveMeasurements } from './store';
import { isRecord } from './validation';

function parseConnection(value: unknown) {
  if (!isRecord(value) || typeof value.provider !== 'string') throw new Error('Elegí una conexión válida.');
  const allowed: Record<string, string[]> = { cloudflare: ['provider', 'token', 'accountId', 'worker'], database: ['provider', 'token'], 'google-ads': ['provider', 'developerToken', 'customerId'] };
  const keys = allowed[value.provider];
  if (!keys || Object.keys(value).some((key) => !keys.includes(key))) throw new Error('La conexión no tiene el formato indicado.');
  const text = (key: string, maximum = 4096) => {
    const field = value[key];
    if (typeof field !== 'string' || !field.trim() || field.length > maximum || /[\x00-\x20\x7f]/.test(field)) throw new Error('Completá los campos de autorización sin espacios.');
    return field;
  };
  if (value.provider === 'cloudflare') {
    const accountId = text('accountId', 32), worker = text('worker', 64);
    if (!/^[a-f0-9]{32}$/.test(accountId) || !/^[a-zA-Z0-9_-]{1,64}$/.test(worker)) throw new Error('Revisá el identificador de cuenta y el nombre del Worker.');
    return { provider: 'cloudflare' as const, data: { token: text('token'), accountId, worker } };
  }
  if (value.provider === 'database') return { provider: 'database' as const, data: { token: text('token'), projectId: 'zyiyziubpcpgoqlkcrie' } };
  const customerId = text('customerId', 10);
  if (!/^\d{10}$/.test(customerId)) throw new Error('Ingresá los diez números de la cuenta, sin guiones.');
  return { provider: 'google-ads' as const, data: { developerToken: text('developerToken', 256), customerId } };
}

export async function handleConnectionPost(request: NextRequest) {
  try {
    if (!await authorizeMeasurementRequest(request)) return privateJson({ error: 'No autorizado' }, 401);
    if (!hasSameOrigin(request)) return privateJson({ error: 'La solicitud debe salir desde esta página.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return privateJson({ error: 'Formato no válido.' }, 415);
    let connection;
    try { connection = parseConnection(await readBoundedJson(request)); } catch { return privateJson({ error: 'Revisá los campos de la conexión. La autorización no se guardó.' }, 400); }
    await saveCredential(connection.provider, connection.data);
    await saveMeasurements([], [{ id: connection.provider, state: 'ready', checkedAt: new Date().toISOString(), issue: null }]);
    try {
      const result = await executeMeasurementCommand({ action: 'sync', provider: connection.provider });
      return privateJson({ ...result, message: `Autorización guardada en forma privada. ${result.message}` });
    } catch (error) {
      if (!(error instanceof CollectionRequestError)) throw error;
      return privateJson({ dashboard: await getMeasurementDashboard(), message: `Autorización guardada en forma privada. La lectura todavía no está verificada. ${error.message}` }, 202);
    }
  } catch { return privateJson({ error: 'No se pudo guardar o verificar la conexión. Revisá la configuración privada del panel.' }, 503); }
}
