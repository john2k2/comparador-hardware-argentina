// Rotación local durable: programar no equivale a observar una oferta.
import { enqueueKnownProducts, initializeRefreshDemand, offerFromRow } from './refresh-demand.mjs';
const HOUR = 3600000;
const SCHEMA = `CREATE TABLE IF NOT EXISTS pilot_rotation_state(
 key TEXT PRIMARY KEY,pass_number INTEGER NOT NULL DEFAULT 0,
 pass_started_at INTEGER, next_pass_at INTEGER NOT NULL DEFAULT 0,
 cursor TEXT, ceiling_id TEXT, completed INTEGER NOT NULL DEFAULT 1,
 last_tick_at INTEGER NOT NULL DEFAULT 0, capabilities_json TEXT
);`;
function validClock(now) {
  if(!Number.isSafeInteger(now)||!Number.isFinite(new Date(now).valueOf()))throw new Error('ROTATION_INVALID_CLOCK');
}
function validKey(key) {
  if(typeof key!=='string'||!/^[-a-z0-9]{1,80}$/.test(key))throw new Error('ROTATION_INVALID_KEY');
}
function capabilitySpec(capabilities) {
  const {storeIds,categories,version='1'}=capabilities??{};
  const validatorTarget=capabilities?.validateTarget??capabilities?.validatorTarget;
  if(!Array.isArray(storeIds)||storeIds.length>34||storeIds.some(id=>typeof id!=='string'||!/^[-a-z0-9]{1,80}$/.test(id))
    ||!Array.isArray(categories)||categories.length>30||categories.some(id=>typeof id!=='string'||!/^[-a-z0-9]{1,80}$/.test(id))
    ||(validatorTarget!==undefined&&typeof validatorTarget!=='function')||typeof version!=='string'||version.length>100)throw new Error('ROTATION_INVALID_CAPABILITIES');
  return {stores:new Set(storeIds),categories:new Set(categories),validatorTarget,
    signature:JSON.stringify({storeIds:[...new Set(storeIds)].sort(),categories:[...new Set(categories)].sort(),version})};
}
function classify(row,spec) {
  if(!spec.stores.has(row.store_id))return {state:'unsupported',reason:'unsupported-store'};
  if(!spec.categories.has(row.category))return {state:'unsupported',reason:'unsupported-category'};
  if(!offerFromRow(row))return {state:'rejected',reason:'invalid-known-offer'};
  let name='';try{name=JSON.parse(row.product_json)?.name??'';}catch{/* Sin nombre demostrable. */}
  if(typeof name!=='string')name='';
  if(spec.validatorTarget) {
    const result=spec.validatorTarget(row.store_id,row.url,row.category,name);
    if(result!==true&&result?.supported!==true) {
      const reason=typeof result?.reason==='string'&&/^[-a-z0-9]{1,80}$/.test(result.reason)?result.reason:'unsupported-target-or-attributes';
      return {state:'unsupported',reason};
    }
  }
  return {state:'supported',reason:null};
}
export function initializeRotation(db,{key='catalog'}={}) {
  validKey(key);initializeRefreshDemand(db);db.exec(SCHEMA);
  db.prepare('INSERT OR IGNORE INTO pilot_rotation_state(key) VALUES(?)').run(key);
}

/** Un prefijo de hasta100 ofertas/20 productos, con cursor y cola en el mismo commit. */
export function seedNextRotationBatch(db,{key='catalog',now=Date.now(),capabilities,batchSize=100,
  passIntervalMs=24*HOUR,freshMs=24*HOUR,refreshAheadMs=90*60000,deadlineAt,clock=Date.now}={}) {
  validKey(key);validClock(now);const spec=capabilitySpec(capabilities);
  if(!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100
    ||!Number.isSafeInteger(passIntervalMs)||passIntervalMs<20*HOUR||passIntervalMs>24*HOUR
    ||!Number.isSafeInteger(freshMs)||freshMs<=0||freshMs>24*HOUR
    ||!Number.isSafeInteger(refreshAheadMs)||refreshAheadMs<0||refreshAheadMs>=freshMs
    ||typeof clock!=='function')throw new Error('ROTATION_INVALID_LIMITS');
  if(deadlineAt!==undefined)validClock(deadlineAt);
  if(db.isTransaction)throw new Error('ROTATION_OWN_TRANSACTION_REQUIRED');
  db.exec('BEGIN IMMEDIATE');
  try {
    let state=db.prepare('SELECT * FROM pilot_rotation_state WHERE key=?').get(key);
    if(!state)throw new Error('ROTATION_NOT_INITIALIZED');
    if(now<state.last_tick_at)throw new Error('ROTATION_CLOCK_REGRESSION');
    const checkDeadline=()=>{const current=clock();validClock(current);if(current<now)throw new Error('ROTATION_CLOCK_REGRESSION');return deadlineAt!==undefined&&current>=deadlineAt;};
    if(checkDeadline()) {db.exec('COMMIT');return {status:'deadline',complete:Boolean(state.completed),examined:0,pass:state.pass_number,cursor:state.cursor,nextPassAt:state.next_pass_at};}
    if(state.completed&&now<state.next_pass_at) {db.exec('COMMIT');return {status:'waiting',complete:true,examined:0,pass:state.pass_number,cursor:state.cursor,nextPassAt:state.next_pass_at};}
    if(!state.completed&&state.capabilities_json!==spec.signature)throw new Error('ROTATION_CAPABILITIES_CHANGED');
    if(state.completed) {
      state={...state,pass_number:state.pass_number+1,pass_started_at:now,next_pass_at:now+passIntervalMs,
        cursor:null,ceiling_id:db.prepare('SELECT MAX(id) id FROM product_prices').get().id,completed:0,capabilities_json:spec.signature};
    }
    const rows=state.ceiling_id===null?[]:db.prepare(`SELECT pp.*,p.category,p.row_json product_json FROM product_prices pp
      LEFT JOIN products p ON p.id=pp.product_id WHERE (? IS NULL OR pp.id>?) AND pp.id<=?
      ORDER BY pp.id LIMIT ?`).all(state.cursor,state.cursor,state.ceiling_id,batchSize+1);
    const selected=[],products=new Set(),reasons={};let examined=0,unsupported=0,rejected=0,cursor=state.cursor,stopped=false;
    for(const row of rows.slice(0,batchSize)) {
      if(checkDeadline()) {stopped=true;break;}
      const {state:support,reason}=classify(row,spec);
      if(support==='supported'&&!products.has(row.product_id)&&products.size===20){stopped=true;break;}
      examined++;cursor=row.id;if(reason)reasons[reason]=(reasons[reason]??0)+1;
      if(support==='unsupported')unsupported++;
      else if(support==='rejected')rejected++;
      else {selected.push(row.id);products.add(row.product_id);}
    }
    const complete=!stopped&&examined===rows.length;
    const queued=enqueueKnownProducts(db,{productIds:[...products],offerIds:selected,now,freshMs,refreshAheadMs,
      storeIds:[...spec.stores],withinTransaction:true});
    if(queued.truncated)throw new Error('ROTATION_UNEXPECTED_TRUNCATION');
    db.prepare(`UPDATE pilot_rotation_state SET pass_number=?,pass_started_at=?,next_pass_at=?,cursor=?,ceiling_id=?,
      completed=?,last_tick_at=?,capabilities_json=? WHERE key=?`).run(state.pass_number,state.pass_started_at,state.next_pass_at,
      cursor,state.ceiling_id,Number(complete),now,spec.signature,key);
    db.exec('COMMIT');
    return {status:stopped?'partial':'seeded',pass:state.pass_number,startedAt:state.pass_started_at,nextPassAt:state.next_pass_at,
      cursor,complete,examined,supported:selected.length,unsupported,rejected:rejected+queued.rejected,productIds:[...products],offerIds:selected,reasons,queued};
  }catch(error){db.exec('ROLLBACK');throw error;}
}
function emptyCounts() {
  return {reasons:{},total:0,supported:0,unsupported:0,rejected:0,unprogrammed:0,pending:0,leased:0,backoff:0,blocked:0,
    failed:0,expired:0,observedRecent:0,comparableRecent:0,locallyObservedRecent:0,observedThisTrial:0,comparableThisTrial:0};
}

/** Denominador completo, incluidos destinos no soportados; sólo fecha de oferta y basis vigente. */
export function coverageSnapshot(db,{now=Date.now(),capabilities,freshMs=24*HOUR,sinceStartedAt,key='catalog'}={}) {
  validClock(now);validKey(key);const spec=capabilitySpec(capabilities);
  if(!Number.isSafeInteger(freshMs)||freshMs<=0||freshMs>24*HOUR)throw new Error('ROTATION_INVALID_WINDOW');
  if(sinceStartedAt!==undefined){validClock(sinceStartedAt);if(sinceStartedAt>now)throw new Error('ROTATION_INVALID_WINDOW');}
  const own=!db.isTransaction;if(own)db.exec('BEGIN');
  try {
    const totals=emptyCounts(),groups=new Map();let cursor=null;
    const basis=db.prepare(`SELECT 1 FROM price_basis WHERE kind='current' AND id=? AND product_id=? AND store_id=?
      AND url=? AND observed_at=? AND price=? AND stock=? AND stock IN('in-stock','low-stock') LIMIT 1`);
    for(;;) {
      const rows=db.prepare(`SELECT pp.*,p.category,p.row_json product_json,q.status queue_status,q.expires_at,q.last_error,q.last_observed_at
        FROM product_prices pp LEFT JOIN products p ON p.id=pp.product_id LEFT JOIN pilot_refresh_demand q ON q.offer_id=pp.id
        WHERE (? IS NULL OR pp.id>?) ORDER BY pp.id LIMIT 250`).all(cursor,cursor);
      if(!rows.length)break;
      for(const row of rows) {
        const category=row.category??'unclassified',groupKey=JSON.stringify([row.store_id,category]);
        if(!groups.has(groupKey))groups.set(groupKey,{storeId:row.store_id,category,...emptyCounts()});
        const counts=[totals,groups.get(groupKey)],{state:support,reason}=classify(row,spec),offer=offerFromRow(row);
        const observed=offer?.observedAt?Date.parse(offer.observedAt):NaN;
        const recent=Number.isFinite(observed)&&observed<=now&&observed>=now-freshMs;
        const local=recent&&row.last_observed_at===offer.observedAt;
        const trial=sinceStartedAt!==undefined&&Number.isFinite(observed)&&observed>=sinceStartedAt&&observed<=now;
        const comparable=(recent||trial)&&offer&&Number.isFinite(offer.price)&&offer.price>0
          &&['in-stock','low-stock'].includes(offer.stock)&&Boolean(basis.get(row.id,row.product_id,row.store_id,row.url,offer.observedAt,offer.price,offer.stock));
        for(const count of counts) {
          count.total++;count[support]++;if(reason)count.reasons[reason]=(count.reasons[reason]??0)+1;
          if(!row.queue_status)count.unprogrammed++;
          else if(row.expires_at<=now||row.queue_status==='expired')count.expired++;
          else if(row.queue_status==='pending')count.pending++;
          else if(row.queue_status==='leased')count.leased++;
          else if(row.queue_status==='backoff')count.backoff++;
          if(row.last_error)count.failed++;
          if(['http-403','http-429'].includes(row.last_error))count.blocked++;
          if(recent)count.observedRecent++;
          if(recent&&comparable)count.comparableRecent++;
          if(local)count.locallyObservedRecent++;
          if(trial)count.observedThisTrial++;
          if(trial&&recent&&comparable)count.comparableThisTrial++;
        }
        cursor=row.id;
      }
    }
    const rotation=db.prepare('SELECT * FROM pilot_rotation_state WHERE key=?').get(key)??null;
    if(own)db.exec('COMMIT');
    return {asOf:new Date(now).toISOString(),freshMs,sinceStartedAt:sinceStartedAt??null,totals,groups:[...groups.values()],rotation,
      observationBasis:'product_prices.row_json.last_updated',comparableBasis:'matching-current-price_basis',failureBasis:'last-recorded-queue-attempt',localOnly:true};
  }catch(error){if(own)db.exec('ROLLBACK');throw error;}
}
