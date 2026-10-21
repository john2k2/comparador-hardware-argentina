#!/usr/bin/env python3
"""Crea un destino privado vacío y restaura exclusivamente public/auth/extensions."""
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

ROOT = Path('/opt/comparador-catalog')
CONTAINER = 'comparador-catalog-db'
IMAGE = 'postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
BACKUP = Path('/root/comparador-backups/20261020T130058Z-id0rifqm')
SCHEMAS = {'public', 'auth', 'extensions'}
EXTENSIONS = {'pg_stat_statements', 'pg_trgm', 'pgcrypto', 'uuid-ossp'}


def run(command, timeout=120, input_data=None):
    return subprocess.run(command, input=input_data, capture_output=True, timeout=timeout, check=False)


def sql(statement):
    result = run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres',
                  '-d', 'catalog', '-v', 'ON_ERROR_STOP=1'], input_data=statement.encode('utf-8'))
    if result.returncode:
        (ROOT / 'query-error.log').write_bytes(result.stderr)
        raise RuntimeError('CATALOG_SQL_FAILED')
    return result.stdout.decode('utf-8').strip()


def select_restore_entries(toc):
    all_schemas = {line.split()[5] for line in toc if re.match(r'^\d+; \d+ \d+ SCHEMA - ', line)} | SCHEMAS | {'pg_catalog', 'information_schema'}
    selected = []
    public_schema_in_archive = False
    for line in toc:
        fields = line.split()
        if len(fields) < 5 or not re.fullmatch(r'\d+;', fields[0]):
            continue
        index = next((i for i in range(3, len(fields)) if fields[i] in all_schemas or fields[i] == '-'), None)
        if index is None:
            raise RuntimeError('CATALOG_TOC_UNKNOWN')
        kind = ' '.join(fields[3:index])
        namespace = fields[index]
        name = fields[index + 1:]
        keep = namespace in SCHEMAS
        if namespace == '-' and name:
            keep = (kind == 'SCHEMA' and name[0] in SCHEMAS
                    or kind == 'EXTENSION' and name[0].strip('"') in EXTENSIONS
                    or kind in {'ACL', 'COMMENT'} and len(name) > 1 and name[0] == 'SCHEMA' and name[1] in SCHEMAS
                    or kind == 'COMMENT' and len(name) > 1 and name[0] == 'EXTENSION' and name[1].strip('"') in EXTENSIONS)
        if keep:
            selected.append(line)
            if kind == 'SCHEMA' and name[0] == 'public':
                public_schema_in_archive = True
    if not selected:
        raise RuntimeError('CATALOG_TOC_EMPTY')
    return selected, public_schema_in_archive


def main():
    resume = sys.argv[1:] == ['--resume-empty']
    if sys.argv[1:] not in (['--apply'], ['--resume-empty']) or os.geteuid() != 0:
        raise RuntimeError('CATALOG_REQUIRE_ROOT_AND_APPLY')
    if ROOT.exists() and not resume:
        raise RuntimeError('CATALOG_DESTINATION_ALREADY_EXISTS')
    if not resume:
        for kind, name in [('container', CONTAINER), ('volume', 'comparador_catalog_pgdata'), ('network', 'comparador_catalog_private')]:
            if run(['docker', kind, 'inspect', name]).returncode == 0:
                raise RuntimeError('CATALOG_RESOURCE_ALREADY_EXISTS')
    manifest = json.loads((BACKUP / 'manifest.json').read_text())
    with (BACKUP / 'database.dump').open('rb') as handle:
        if hashlib.file_digest(handle, 'sha256').hexdigest() != manifest['sha256']:
            raise RuntimeError('CATALOG_BACKUP_CHECKSUM_FAILED')
    if not manifest.get('publicAuthSchemaDataRestorationVerified'):
        raise RuntimeError('CATALOG_REQUIRE_RESTORE_QA')
    if resume:
        receipt = json.loads((ROOT / 'migration.json').read_text())
        if receipt['state'] not in {'preparing', 'restore_failed'} or receipt['sourceSha256'] != manifest['sha256']:
            raise RuntimeError('CATALOG_RESUME_STATE_INVALID')
    else:
        ROOT.mkdir(mode=0o700)
        (ROOT / 'secrets').mkdir(mode=0o700)
        (ROOT / 'secrets/database-admin-password').write_text(secrets.token_urlsafe(48) + '\n')
        shutil.copyfile(Path(__file__).with_name('catalog-compose.yaml'), ROOT / 'compose.yaml')
        receipt = {'state': 'preparing', 'sourceBackup': str(BACKUP), 'sourceSha256': manifest['sha256'],
                   'sourceSnapshotStartedAt': manifest['startedAt'], 'startedAt': datetime.now(timezone.utc).isoformat(),
                   'schemas': sorted(SCHEMAS), 'scope': 'private persistent database; no Auth service or public cutover'}

    def save():
        (ROOT / 'migration.json').write_text(json.dumps(receipt, indent=2) + '\n')

    save()
    compose = ['docker', 'compose', '--project-directory', str(ROOT), '-f', str(ROOT / 'compose.yaml')]
    result = run(compose + ['up', '-d'])
    (ROOT / 'startup.log').write_bytes(result.stdout + result.stderr)
    if result.returncode:
        raise RuntimeError('CATALOG_DATABASE_START_FAILED')
    for _ in range(90):
        if run(['docker', 'exec', CONTAINER, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'catalog'], timeout=5).returncode == 0:
            break
        time.sleep(1)
    else:
        raise RuntimeError('CATALOG_DATABASE_NOT_READY')
    if int(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','auth') and c.relkind='r';")):
        raise RuntimeError('CATALOG_DATABASE_NOT_EMPTY')
    # Conservar nombres/propietarios y ACL sin reactivar logins del proveedor.
    roles = re.findall(r'^CREATE ROLE ([a-z_][a-z0-9_]*);$', (BACKUP / 'roles.sql').read_text(), re.M)
    for role in roles:
        if role != 'postgres' and not role.startswith('pg_'):
            if sql(f"SELECT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='{role}');") == 't':
                continue
            inherit = 'NOINHERIT' if role in {'authenticator', 'supabase_auth_admin', 'supabase_storage_admin', 'supabase_realtime_admin'} else 'INHERIT'
            bypass = 'BYPASSRLS' if role == 'service_role' else 'NOBYPASSRLS'
            sql(f'CREATE ROLE "{role}" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION {inherit} {bypass};')
    # Preparar una lista explícita preserva también SCHEMA/ACL de namespace '-'.
    # Excluir event triggers y esquemas administrados ajenos al catálogo.
    toc = (BACKUP / 'archive.list').read_text().splitlines()
    selected, public_schema_in_archive = select_restore_entries(toc)
    if public_schema_in_archive:
        sql('DROP SCHEMA public;')  # Sólo el namespace vacío del destino nuevo.
    selection = ROOT / 'restore.list'
    selection.write_text('\n'.join(selected) + '\n')
    run(['docker', 'cp', str(selection), CONTAINER + ':/tmp/restore.list']).check_returncode()
    run(['docker', 'cp', str(BACKUP / 'database.dump'), CONTAINER + ':/tmp/catalog-source.dump']).check_returncode()
    receipt['state'] = 'restoring'
    receipt['selectedTocEntries'] = len(selected)
    save()
    result = run(['docker', 'exec', CONTAINER, 'pg_restore', '-U', 'postgres', '-d', 'catalog',
                  '--use-list=/tmp/restore.list', '--exit-on-error', '--single-transaction', '/tmp/catalog-source.dump'], timeout=1800)
    (ROOT / 'restore.log').write_bytes(result.stderr)
    if result.returncode:
        receipt['state'] = 'restore_failed'
        save()
        raise RuntimeError('CATALOG_RESTORE_FAILED')
    receipt['state'] = 'restored_pending_validation'
    receipt['restoredAt'] = datetime.now(timezone.utc).isoformat()
    save()
    print('CATALOG_PERSISTENT_RESTORED ' + json.dumps(receipt))


if __name__ == '__main__':
    os.umask(0o077)
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error) if isinstance(error, RuntimeError) else 'CATALOG_PREPARATION_ERROR')
        sys.exit(1)
