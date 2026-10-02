import { writeFile } from 'node:fs/promises';
import { getServerSupabaseServiceClient } from '../../src/lib/server/supabase-server';
import { refreshEnebaPilot } from '../../src/lib/eneba/producer';
const [path] = process.argv.slice(2);
let result;
try {
  if (process.env.ENEBA_AFFILIATE_PILOT_ENABLED !== '1') result = {status:'disabled'};
  else {
    const client = getServerSupabaseServiceClient();
    if (!client) throw new Error('ENEBA_DATABASE_UNAVAILABLE');
    result = await refreshEnebaPilot(client);
  }
} catch (error) {
  const code = error instanceof Error && /^ENEBA_[A-Z_]+$/.test(error.message) ? error.message : 'ENEBA_REFRESH_FAILED';
  result = {status:'failed',code,measuredAt:new Date().toISOString()}; process.exitCode = 1;
}
if (path) await writeFile(path, JSON.stringify(result,null,2));
process.stdout.write(JSON.stringify(result)+'\n');
