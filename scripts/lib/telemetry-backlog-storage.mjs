// Transferencias del drenaje puntual: tres objetos independientes, readback completo.
import {telemetryObjectPlan,TELEMETRY_BUCKET} from './telemetry-backup-storage.mjs';
import {verifyTelemetryBackup} from './telemetry-backup.mjs';
import {decodeTelemetrySelection} from './telemetry-selection-codec.mjs';
import {createHash} from 'node:crypto';

const fail=code=>{throw new Error(`TELEMETRY_BACKLOG_STORAGE_${code}`);};
async function requirePrivateBucket(storage) {
  const response=await storage.getBucket(TELEMETRY_BUCKET),bucket=response?.data;
  if(response?.error||bucket?.id!==TELEMETRY_BUCKET||bucket.public!==false||Number(bucket.file_size_limit)!==1048576
    ||JSON.stringify([...(bucket.allowed_mime_types||[])].sort())!==JSON.stringify(['application/gzip','application/json']))fail('BUCKET');
}

export async function storeTelemetryBacklogArchive(storage,archive) {
  verifyTelemetryBackup(archive.backup.manifest,archive.backup.gzipBytes,archive.expected);
  const plan=telemetryObjectPlan(archive.backup);
  if(plan.manifestSha256!==archive.manifestSha256||archive.selectionKey!==plan.prefix+'/selection.json.gz')fail('PREFIX');
  const selection=decodeTelemetrySelection(archive.selectionGzipBytes);
  if(!selection.equals(archive.selectionBytes)||createHash('sha256').update(selection).digest('hex')!==archive.expected.selectionSha256)fail('SELECTION');
  const objects=[...plan.objects,{key:archive.selectionKey,bytes:archive.selectionGzipBytes,contentType:'application/gzip'}];
  if(objects.some(object=>!Buffer.isBuffer(object.bytes)||object.bytes.length<1||object.bytes.length>1048576))fail('BYTES');
  await requirePrivateBucket(storage);
  const files=storage.from(TELEMETRY_BUCKET);
  // Cada POST es independiente e inmutable. Un rechazo no prueba ausencia ni permite reintento.
  await Promise.allSettled(objects.map(async object=>files.upload(object.key,object.bytes,
    {upsert:false,contentType:object.contentType,cacheControl:'3600'})));
  await requirePrivateBucket(storage);
  const reads=await Promise.allSettled(objects.map(async object=>{
    const response=await files.download(object.key);
    if(response?.error||response?.data?.size!==object.bytes.length||response.data.size>1048576)fail('DOWNLOAD');
    const bytes=Buffer.from(await response.data.arrayBuffer());
    if(!bytes.equals(object.bytes))fail('READBACK');
    return bytes;
  }));
  // Esperar las tres lecturas incluso si falla una; nunca se continúa con custodia parcial.
  if(reads.some(read=>read.status!=='fulfilled'))fail('READBACK');
  const [gzipBytes,manifestBytes,selectionGzipBytes]=reads.map(read=>read.value);
  const manifest=JSON.parse(manifestBytes.toString('utf8'));
  verifyTelemetryBackup(manifest,gzipBytes,archive.expected);
  const selectionBytes=decodeTelemetrySelection(selectionGzipBytes);
  if(!selectionBytes.equals(archive.selectionBytes))fail('SELECTION');
  return {manifest,gzipBytes,selectionBytes};
}

export async function reconcileTelemetryBacklogMetadata(keys,readPage) {
  if(!Array.isArray(keys)||keys.length<1||keys.length>250||new Set(keys).size!==keys.length
    ||keys.some(key=>typeof key!=='string'||key.length===0)||typeof readPage!=='function')fail('KEYS');
  const pages=Array.from({length:Math.ceil(keys.length/50)},(_,i)=>keys.slice(i*50,i*50+50));
  const reads=await Promise.allSettled(pages.map(async page=>{
    const rows=await readPage(page);
    if(!Array.isArray(rows)||rows.length>page.length||rows.some(row=>!page.includes(row?.cache_key)))fail('METADATA_PAGE');
    return rows;
  }));
  if(reads.some(read=>read.status!=='fulfilled'))fail('METADATA_READ');
  return reads.flatMap(read=>read.value);
}
