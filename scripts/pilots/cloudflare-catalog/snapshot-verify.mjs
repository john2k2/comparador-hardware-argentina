// Fallar antes de crear destinos si una captura cambió o no terminó.
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
const tables=['stores','products','product_prices','catalog_price_summaries'];
export async function verifySnapshot(source) {
 const manifest=JSON.parse(readFileSync(join(source,'manifest.json'),'utf8'));
 if(!manifest.endedAt||!Number.isFinite(Date.parse(manifest.referenceNow))||manifest.tables?.length!==4
 ||new Set(manifest.tables.map(t=>t.table)).size!==4||manifest.tables.some(t=>!tables.includes(t.table)||!t.terminatedOnEmptyPage)) throw new Error('SNAPSHOT_INCOMPLETE');
 for(const entry of manifest.tables) {
  const hash=createHash('sha256');let count=0;
  for await(const line of createInterface({input:createReadStream(join(source,entry.table+'.jsonl')),crlfDelay:Infinity})) {if(!line)continue;JSON.parse(line);hash.update(line+'\n');count++;}
  if(count!==entry.count||hash.digest('hex')!==entry.sha256) throw new Error('SNAPSHOT_INTEGRITY_MISMATCH:'+entry.table);
 }
 return manifest;
}
