#!/usr/bin/env python3
"""Conserva escrituras de la web durante el corte; nunca mezcla observaciones de ofertas."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path('/opt/comparador-catalog')
BASELINE = ROOT / 'state/handoff-baseline.json'
KEYS = {'requested_offer_refreshes': 'id', 'api_cache_entries': 'cache_key', 'api_rate_limits': 'bucket_key'}


def sql(database, statement):
    result = subprocess.run(['docker', 'exec', '-i', 'comparador-catalog-db', 'psql', '-X', '-q', '-A', '-t',
                             '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
                            input=statement.encode(), capture_output=True, timeout=120)
    if result.returncode:
        raise RuntimeError('HANDOFF_OVERLAY_SQL_FAILED')
    return result.stdout.decode().strip()


def fingerprint(table):
    hashes = sql('catalog', f'COPY (SELECT md5(to_jsonb(t)::text) FROM public."{table}" t ORDER BY 1) TO STDOUT;')
    return hashlib.sha256(hashes.encode()).hexdigest()


def rows(table):
    return json.loads(sql('catalog', f"SELECT coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM public.{table} t;"))


def changed_rows(before, after, key):
    original = {row[key]: row for row in before}
    current = {row[key]: row for row in after}
    return [row for identity, row in current.items() if original.get(identity) != row], [row for identity, row in original.items() if identity not in current]


def literal(value):
    return "'" + json.dumps(value, ensure_ascii=True).replace("'", "''") + "'::jsonb"


def overlay_statements(baseline, current, prefix='public.'):
    # prefix sólo se parametriza para QA con tablas temporales, nunca desde CLI.
    output = []
    counts = {}
    for table, key in KEYS.items():
        changed, deleted = changed_rows(baseline[table], current[table], key)
        if table == 'requested_offer_refreshes':
            original = {row[key] for row in baseline[table]}
            changed = [row for row in changed if row[key] not in original]
            # Los estados de solicitudes viejas pertenecen al origen drenado.
            if changed:
                output.append(f'INSERT INTO {prefix}{table} SELECT * FROM jsonb_populate_recordset(NULL::{prefix}{table}, {literal(changed)});')
        elif table == 'api_cache_entries':
            if changed:
                output.append(f'''INSERT INTO {prefix}{table} AS existing SELECT * FROM jsonb_populate_recordset(NULL::{prefix}{table}, {literal(changed)})
ON CONFLICT(cache_key) DO UPDATE SET scope=excluded.scope,payload=excluded.payload,expires_at=excluded.expires_at,
updated_at=excluded.updated_at WHERE excluded.updated_at > existing.updated_at;''')
            for row in deleted:
                output.append(f"DELETE FROM {prefix}{table} WHERE cache_key={literal(row['cache_key'])}#>>'{{}}' AND updated_at <= ({literal(row['updated_at'])}#>>'{{}}')::timestamptz;")
        else:
            originals = {row[key]: row for row in baseline[table]}
            for row in changed:
                old = originals.get(row[key])
                delta = max(0, row['count'] - old['count']) if old and old['window_end'] == row['window_end'] else row['count']
                output.append(f'''INSERT INTO {prefix}{table} AS existing SELECT * FROM jsonb_populate_recordset(NULL::{prefix}{table}, {literal([row])})
ON CONFLICT(bucket_key) DO UPDATE SET
count=CASE WHEN excluded.window_end=existing.window_end THEN least(2147483647::bigint,existing.count::bigint+{delta})::integer ELSE excluded.count END,
window_end=excluded.window_end,updated_at=greatest(existing.updated_at,excluded.updated_at)
WHERE excluded.window_end >= existing.window_end;''')
        counts[table] = {'upserts': len(changed), 'deletedInVps': len(deleted)}
    return output, counts


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('mode', choices=['baseline', 'apply'])
    parser.add_argument('--candidate')
    args = parser.parse_args()
    if os.geteuid() != 0 or (ROOT / 'state/handoff-ready').exists() or (ROOT / 'updater-enabled').exists():
        raise RuntimeError('HANDOFF_OVERLAY_UNSAFE_STATE')
    if args.mode == 'baseline':
        if BASELINE.exists():
            raise RuntimeError('HANDOFF_OVERLAY_BASELINE_EXISTS')
        tables = sql('catalog', "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").splitlines()
        if not all(re.fullmatch('[a-z][a-z0-9_]*', table) for table in tables) or not set(KEYS).issubset(tables):
            raise RuntimeError('HANDOFF_OVERLAY_TABLES_INVALID')
        value = {'createdAt': datetime.now(timezone.utc).isoformat(),
                 'fingerprints': {table: fingerprint(table) for table in tables if table not in KEYS},
                 'rows': {table: rows(table) for table in KEYS}}
        with BASELINE.open('x') as handle:
            json.dump(value, handle)
        print('HANDOFF_OVERLAY_BASELINE_READY ' + json.dumps({'createdAt': value['createdAt'], 'protectedTables': len(value['fingerprints'])}))
        return
    if not args.candidate or not re.fullmatch(r'catalog_candidate_[a-z0-9_]{1,32}', args.candidate):
        raise RuntimeError('HANDOFF_OVERLAY_CANDIDATE_INVALID')
    # El promotor detiene gateway/PostgREST antes de invocar este paso.
    for name in ['comparador-catalog-gateway', 'comparador-catalog-rest']:
        check = subprocess.run(['docker', 'inspect', '-f', '{{.State.Running}}', name], capture_output=True, check=True)
        if check.stdout.strip() != b'false':
            raise RuntimeError('HANDOFF_OVERLAY_WRITERS_RUNNING')
    receipt_path = ROOT / (args.candidate + '-overlay.json')
    if receipt_path.exists():
        raise RuntimeError('HANDOFF_OVERLAY_ALREADY_APPLIED')
    baseline = json.loads(BASELINE.read_text())
    if any(fingerprint(table) != expected for table, expected in baseline['fingerprints'].items()):
        raise RuntimeError('HANDOFF_OVERLAY_UNEXPECTED_CATALOG_WRITE')
    current = {table: rows(table) for table in KEYS}
    statements, counts = overlay_statements(baseline['rows'], current)
    sql(args.candidate, "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL standard_conforming_strings=on;\n" + '\n'.join(statements) + '\nCOMMIT;')
    receipt = {'status': 'applied', 'baselineAt': baseline['createdAt'], 'appliedAt': datetime.now(timezone.utc).isoformat(),
               'tables': counts, 'scope': 'new VPS requests and changed cache/rate limits; source catalog and old requests preserved'}
    receipt_path.write_text(json.dumps(receipt, indent=2) + '\n')
    print('HANDOFF_OVERLAY_APPLIED ' + json.dumps(receipt))


if __name__ == '__main__':
    os.umask(0o077)
    main()
