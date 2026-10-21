#!/usr/bin/env python3
"""Contrasta todas las filas con el archivo y prueba permisos sin modificar datos."""
import hashlib
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path('/opt/comparador-catalog')
CONTAINER = 'comparador-catalog-db'
IMAGE = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
BACKUP = Path('/root/comparador-backups/20261020T130058Z-id0rifqm')
PSQL = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres', '-d', 'catalog', '-v', 'ON_ERROR_STOP=1']
MIGRATION = ROOT / 'migration.json'
VALIDATION = ROOT / 'validation.json'


def digest_rows(rows):
    return hashlib.sha256(b''.join(sorted(rows))).hexdigest()


def sql(statement):
    result = subprocess.run(PSQL, input=statement.encode('utf-8'), capture_output=True, timeout=180, check=False)
    if result.returncode:
        (ROOT / 'validation-error.log').write_bytes(result.stderr)
        raise RuntimeError('CATALOG_VALIDATION_QUERY_FAILED')
    return result.stdout.decode('utf-8').strip()


def main():
    global BACKUP, MIGRATION, VALIDATION
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate')
    parser.add_argument('--backup')
    args = parser.parse_args()
    if bool(args.candidate) != bool(args.backup):
        raise RuntimeError('CATALOG_CANDIDATE_ARGUMENTS')
    if args.candidate:
        if not re.fullmatch(r'catalog_candidate_[a-z0-9_]{1,32}', args.candidate):
            raise RuntimeError('CATALOG_CANDIDATE_NAME')
        BACKUP = Path(args.backup).resolve(strict=True)
        if BACKUP.parent != Path('/root/comparador-backups'):
            raise RuntimeError('CATALOG_CANDIDATE_BACKUP_PATH')
        PSQL[PSQL.index('-d') + 1] = args.candidate
        MIGRATION = ROOT / (args.candidate + '-migration.json')
        VALIDATION = ROOT / (args.candidate + '-validation.json')
    receipt = json.loads(MIGRATION.read_text())
    if receipt['state'] not in {'restored_pending_validation', 'ready_private'}:
        raise RuntimeError('CATALOG_REQUIRE_RESTORED_STATE')
    command = ['docker', 'run', '--rm', '--network=none', '--read-only', '--memory=512m', '--cpus=1',
               '--log-driver=none', '--mount', f'type=bind,src={BACKUP},dst=/backup,readonly', IMAGE,
               'pg_restore', '--data-only', '--schema=public', '--schema=auth', '--file=-', '/backup/database.dump']
    decoder = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding='utf-8')
    expected = {}
    active = None
    rows = []
    columns = []
    for line in decoder.stdout:
        if active is not None:
            if line.rstrip('\n') == '\\.':
                expected[active] = {'rows': len(rows), 'sha256': digest_rows(rows), 'columns': columns}
                active = None
                rows = []
            else:
                rows.append(hashlib.sha256(line.encode('utf-8')).digest())
        else:
            match = re.match(r'^COPY (auth|public)\.([a-z_][a-z0-9_]*) \((.*)\) FROM stdin;\n$', line)
            if match:
                active = match.group(1) + '.' + match.group(2)
                columns = [column.strip().strip('"') for column in match.group(3).split(',')]
                if not all(re.fullmatch(r'[a-z_][a-z0-9_]*', column) for column in columns):
                    raise RuntimeError('CATALOG_COLUMN_INVALID')
    if decoder.wait(timeout=60) or active is not None or len(expected) != 47:
        raise RuntimeError('CATALOG_ARCHIVE_ROWS_INVALID')
    results = {}
    for table, entry in expected.items():
        namespace, name = table.split('.')
        projection = ','.join('"' + column + '"' for column in entry['columns'])
        statement = ("SET DateStyle='ISO, MDY'; SET TimeZone='UTC'; SET extra_float_digits=3; "
                     "SET IntervalStyle='postgres'; SET bytea_output='hex'; "
                     f'COPY "{namespace}"."{name}" ({projection}) TO STDOUT;')
        with (ROOT / 'copy-validation-error.log').open('wb') as errors:
            process = subprocess.Popen(PSQL, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=errors, text=True, encoding='utf-8')
            process.stdin.write(statement)
            process.stdin.close()
            actual_rows = [hashlib.sha256(line.encode('utf-8')).digest() for line in process.stdout]
            if process.wait(timeout=120):
                raise RuntimeError('CATALOG_TARGET_COPY_FAILED')
        fingerprint = digest_rows(actual_rows)
        if len(actual_rows) != entry['rows'] or fingerprint != entry['sha256']:
            raise RuntimeError('CATALOG_ROW_CONTENT_MISMATCH')
        results[table] = {'rows': entry['rows'], 'sha256': fingerprint}
        print('CATALOG_TABLE_VERIFIED ' + table, flush=True)
    # Usar IDs sólo dentro del proceso SQL; no imprimir cuentas ni crear fixtures.
    sql("""begin read only;
do $check$
declare account_id uuid; visible integer; expected_profiles integer;
begin
  if exists(select 1 from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname in ('public','auth') and not c.convalidated) then
    raise exception 'Hay restricciones sin validar';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and not c.relrowsecurity) then
    raise exception 'Hay tablas públicas sin RLS';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('persist_catalog_offers','delete_catalog_offers','seed_catalog_refresh_queue')
    and has_function_privilege('anon',p.oid,'EXECUTE')) then
    raise exception 'Anónimo puede ejecutar escrituras privadas';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls and not rolsuper and not rolcanlogin) then
    raise exception 'Rol de servicio incorrecto';
  end if;
  select count(*) into expected_profiles from public.user_profiles;
  select user_id into account_id from public.user_profiles order by user_id limit 1;
  if account_id is null then raise exception 'Falta perfil para contrastar aislamiento'; end if;
  perform set_config('request.jwt.claim.sub',account_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',account_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  select count(*) into visible from public.user_profiles;
  if visible<>1 then raise exception 'Authenticated no ve exclusivamente su perfil'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000000',true);
  perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000000","role":"authenticated"}',true);
  execute 'set local role authenticated';
  select count(*) into visible from public.user_profiles;
  if visible<>0 then raise exception 'Authenticated ve perfiles ajenos'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  execute 'set local role anon';
  begin
    select count(*) into visible from public.user_profiles;
    if visible<>0 then raise exception 'Anónimo ve perfiles'; end if;
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from auth.users limit 1;
    raise exception 'Anónimo puede leer identidades';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  execute 'set local role service_role';
  select count(*) into visible from public.user_profiles;
  if visible<>expected_profiles then raise exception 'Servicio sin acceso esperado'; end if;
  execute 'reset role';
end $check$;
rollback;""")
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'sourceSha256': receipt['sourceSha256'],
              'dataTableCount': len(results), 'allRowsMatchArchive': True, 'rowMultisetFingerprints': results,
              'constraintsValidated': True, 'publicRlsEnabled': True, 'roleIsolationChecksPassed': True,
              'scope': 'private database only; no OAuth service or web cutover'}
    VALIDATION.write_text(json.dumps(report, indent=2) + '\n')
    receipt['state'] = 'ready_private'
    receipt['validatedAt'] = report['checkedAt']
    MIGRATION.write_text(json.dumps(receipt, indent=2) + '\n')
    print('CATALOG_PERSISTENT_VALIDATED ' + json.dumps({key: value for key, value in report.items() if key != 'rowMultisetFingerprints'}))


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'CATALOG_VALIDATION_ERROR')
        sys.exit(1)
