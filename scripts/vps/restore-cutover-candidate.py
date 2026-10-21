#!/usr/bin/env python3
"""Restaura un corte nuevo en OTRA base; conserva intacto el candidato anterior."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from importlib.util import module_from_spec, spec_from_file_location

ROOT = Path('/opt/comparador-catalog')
CONTAINER = 'comparador-catalog-db'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backup', required=True)
    parser.add_argument('--candidate', required=True)
    args = parser.parse_args()
    backup = Path(args.backup).resolve(strict=True)
    if backup.parent != Path('/root/comparador-backups') or not re.fullmatch(r'catalog_candidate_[a-z0-9_]{1,32}', args.candidate):
        raise RuntimeError('CUTOVER_CANDIDATE_ARGUMENTS')
    manifest = json.loads((backup / 'manifest.json').read_text())
    if manifest.get('state') != 'archive_checked' or not manifest.get('rolesExportedWithoutPasswords'):
        raise RuntimeError('CUTOVER_REQUIRE_CHECKED_ARCHIVE')
    with (backup / 'database.dump').open('rb') as handle:
        if hashlib.file_digest(handle, 'sha256').hexdigest() != manifest['sha256']:
            raise RuntimeError('CUTOVER_ARCHIVE_HASH_FAILED')
    psql = ['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-q', '-A', '-t', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1']

    def sql(database, statement):
        result = subprocess.run(psql + ['-d', database], input=statement.encode(), capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError('CUTOVER_CANDIDATE_SQL_FAILED')
        return result.stdout.decode().strip()

    if sql('postgres', f"SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname='{args.candidate}');") != 'f':
        raise RuntimeError('CUTOVER_CANDIDATE_ALREADY_EXISTS')
    receipt_file = ROOT / (args.candidate + '-migration.json')
    if receipt_file.exists():
        raise RuntimeError('CUTOVER_CANDIDATE_RECEIPT_EXISTS')
    spec = spec_from_file_location('restore_selection', ROOT / 'restore-persistent-catalog.py')
    selection_module = module_from_spec(spec)
    spec.loader.exec_module(selection_module)
    entries, public_schema = selection_module.select_restore_entries((backup / 'archive.list').read_text().splitlines())
    receipt = {'state': 'preparing', 'database': args.candidate, 'sourceBackup': str(backup),
               'sourceSha256': manifest['sha256'], 'sourceSnapshotStartedAt': manifest['startedAt'],
               'scope': 'additional private candidate; existing catalog unchanged'}
    receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
    sql('postgres', f'CREATE DATABASE "{args.candidate}" OWNER postgres TEMPLATE template0;')
    if public_schema:
        sql(args.candidate, 'DROP SCHEMA public;')
    selection = ROOT / (args.candidate + '-restore.list')
    selection.write_text('\n'.join(entries) + '\n')
    for source, destination in [(selection, '/tmp/cutover-restore.list'), (backup / 'database.dump', '/tmp/cutover-source.dump')]:
        subprocess.run(['docker', 'cp', str(source), CONTAINER + ':' + destination], check=True, capture_output=True)
    result = subprocess.run(['docker', 'exec', CONTAINER, 'pg_restore', '-U', 'postgres', '-d', args.candidate,
                             '--use-list=/tmp/cutover-restore.list', '--exit-on-error', '--single-transaction',
                             '/tmp/cutover-source.dump'], capture_output=True, timeout=1800)
    (ROOT / (args.candidate + '-restore.log')).write_bytes(result.stderr)
    receipt['state'] = 'restore_failed' if result.returncode else 'restored_pending_validation'
    receipt['restoredAt'] = datetime.now(timezone.utc).isoformat()
    receipt_file.write_text(json.dumps(receipt, indent=2) + '\n')
    if result.returncode:
        raise RuntimeError('CUTOVER_CANDIDATE_RESTORE_FAILED')
    subprocess.run(['python3', str(ROOT / 'validate-persistent-catalog.py'), '--candidate', args.candidate,
                    '--backup', str(backup)], check=True)
    print('CUTOVER_ADDITIONAL_CANDIDATE_VERIFIED')


if __name__ == '__main__':
    os.umask(0o077)
    main()
