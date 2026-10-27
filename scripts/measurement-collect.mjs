// Diagnóstico temporal de sólo lectura; nunca registra tokens ni respuesta completa.
import { build } from 'esbuild';
import { nodeServerBuildOptions } from './lib/node-server-build.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

if (process.env.MEASUREMENT_PROVIDER !== 'search-console' || process.env.MEASUREMENT_TASK !== 'measurements') throw Error('DIAGNOSTIC_ONLY');
const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'gsc-read-check-'));
try {
  const outfile = path.join(folder, 'credential-reader.mjs');
  await build(nodeServerBuildOptions({stdin:{contents:"export { loadConnectionSecrets, GOOGLE_SCOPES } from './src/lib/measurement/credentials';",resolveDir:process.cwd(),loader:'ts'},outfile,logLevel:'silent'}));
  await fs.symlink(path.join(process.cwd(),'node_modules'),path.join(folder,'node_modules'),'dir');
  const {loadConnectionSecrets, GOOGLE_SCOPES} = await import(pathToFileURL(outfile).href);
  const auth=(await loadConnectionSecrets()).google;
  if (!auth) { console.log(JSON.stringify({diagnostic:'search-console',stage:'credential',result:'missing'})); process.exitCode=0; }
  else {
    const hasScope=auth.scopes.includes(GOOGLE_SCOPES['search-console']);
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({grant_type:'refresh_token',client_id:auth.clientId,client_secret:auth.clientSecret,refresh_token:auth.refreshToken}),signal:AbortSignal.timeout(12000)});
    const token=await response.json().catch(()=>({}));
    const allowed=new Set(['invalid_grant','invalid_client','insufficientPermissions','accessNotConfigured','accessNotGranted','forbidden','quotaExceeded','userRateLimitExceeded','rateLimitExceeded','dailyLimitExceeded','PERMISSION_DENIED','UNAUTHENTICATED','RESOURCE_EXHAUSTED']);
    const classify=(value)=>allowed.has(value)?value:'other';
    if(!response.ok || typeof token.access_token!=='string') console.log(JSON.stringify({diagnostic:'search-console',stage:'oauth',status:response.status,reason:classify(token.error),hasScope}));
    else {
      const headers={Authorization:'Bearer '+token.access_token};
      const list=await fetch('https://www.googleapis.com/webmasters/v3/sites',{headers,signal:AbortSignal.timeout(12000)});
      const data=await list.json().catch(()=>({}));
      const site=Array.isArray(data.siteEntry)?data.siteEntry.find(x=>x.siteUrl==='https://www.comparador-hardware.com.ar/'):null;
      const known=new Set(['siteOwner','siteFullUser','siteRestrictedUser','siteUnverifiedUser']);
      const listReason=classify(data.error?.errors?.[0]?.reason ?? data.error?.status);
      const response2=await fetch('https://www.googleapis.com/webmasters/v3/sites/https%3A%2F%2Fwww.comparador-hardware.com.ar%2F/searchAnalytics/query',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({startDate:'2026-09-25',endDate:'2026-10-22',type:'web',dataState:'final',aggregationType:'byProperty',rowLimit:1}),signal:AbortSignal.timeout(12000)});
      const result=await response2.json().catch(()=>({}));
      const reason=classify(result.error?.errors?.[0]?.reason ?? result.error?.status);
      console.log(JSON.stringify({diagnostic:'search-console',stage:'api',oauthStatus:response.status,hasScope,sitesStatus:list.status,sitesReason:list.ok?null:listReason,propertyAccessible:Boolean(site),propertyPermission:known.has(site?.permissionLevel)?site.permissionLevel:null,queryStatus:response2.status,queryReason:response2.ok?null:reason,readingReturned:response2.ok && Array.isArray(result.rows)}));
    }
  }
} catch { console.log(JSON.stringify({diagnostic:'search-console',stage:'transport',result:'unavailable'})); }
finally { await fs.rm(folder,{recursive:true,force:true}); }
