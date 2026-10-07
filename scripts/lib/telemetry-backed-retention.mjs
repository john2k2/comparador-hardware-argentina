// Genera un lote revisable desde un respaldo verificado; no conecta ni ejecuta SQL.
import { verifyTelemetryBackup } from './telemetry-backup.mjs';
import { createHash } from 'node:crypto';

export function prepareBackedTelemetryRetention(backup, expected) {
  const rows = verifyTelemetryBackup(backup.manifest, backup.gzipBytes, expected);
  const literal = text => "'" + text.replaceAll("'", "''") + "'";
  const encoded = JSON.stringify(rows);
  const delimiter = `$telemetry_${createHash('sha256').update(encoded).digest('hex')}$`;
  if (encoded.includes(delimiter)) throw new Error('TELEMETRY_SQL_DELIMITER_COLLISION');
  const snapshot = `snapshot AS (SELECT cache_key,scope,payload::jsonb AS payload,expires_at::timestamptz AS expires_at,
    created_at::timestamptz AS created_at,updated_at::timestamptz AS updated_at
    FROM jsonb_to_recordset(${delimiter}${encoded}${delimiter}::jsonb)
    AS x(cache_key text,scope text,payload text,expires_at text,created_at text,updated_at text))`;
  const predicates = `c.cache_key=s.cache_key AND c.scope=s.scope AND c.payload=s.payload
    AND c.expires_at=s.expires_at AND c.created_at=s.created_at AND c.updated_at=s.updated_at
    AND c.scope IN ('operational-store-event','operational-endpoint-event')
    AND c.expires_at<${literal(backup.manifest.cutoff)}::timestamptz AND c.updated_at<=${literal(backup.manifest.cutoff)}::timestamptz`;
  const settings = "SET LOCAL statement_timeout='3s'; SET LOCAL lock_timeout='500ms'; SET LOCAL standard_conforming_strings=on;";
  const preview = `BEGIN READ ONLY; ${settings}\nWITH ${snapshot},
    matched AS (SELECT c.cache_key FROM public.api_cache_entries c JOIN snapshot s ON ${predicates})
    SELECT jsonb_build_object('selected',${rows.length},'matched',(SELECT count(*) FROM matched),
      'changed_or_missing',${rows.length}-(SELECT count(*) FROM matched),'original_rows_removed',0); ROLLBACK;\n`;
  const apply = `BEGIN; ${settings}\nWITH ${snapshot},
    removed AS (DELETE FROM public.api_cache_entries c USING snapshot s WHERE ${predicates} RETURNING c.cache_key)
    SELECT jsonb_build_object('selected',${rows.length},'removed',(SELECT count(*) FROM removed),
      'changed_or_missing',${rows.length}-(SELECT count(*) FROM removed),
      'removed_keys',coalesce((SELECT jsonb_agg(cache_key ORDER BY cache_key) FROM removed),'[]'::jsonb)); COMMIT;\n`;
  const restore = `BEGIN; ${settings}\nWITH ${snapshot},
    inserted AS (INSERT INTO public.api_cache_entries(cache_key,scope,payload,expires_at,created_at,updated_at)
      SELECT cache_key,scope,payload,expires_at,created_at,updated_at FROM snapshot ON CONFLICT(cache_key) DO NOTHING RETURNING cache_key)
    SELECT jsonb_build_object('selected',${rows.length},'restored',(SELECT count(*) FROM inserted),
      'existing_preserved',${rows.length}-(SELECT count(*) FROM inserted),
      'restored_keys',coalesce((SELECT jsonb_agg(cache_key ORDER BY cache_key) FROM inserted),'[]'::jsonb)); COMMIT;\n`;
  return { selected: rows.length, fieldsCompared: 6, preview, apply, restore, originalRowsRemoved: 0, executionIncluded: false };
}
