#!/usr/bin/env python3
"""Promueve una copia validada; conserva la anterior y revierte si falla el HTTP privado."""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path('/opt/comparador-catalog')
DB = 'comparador-catalog-db'
REST = 'comparador-catalog-rest'


def run(command, timeout=60):
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    if result.returncode:
        if len(command) > 1 and command[0] == 'python3' and Path(command[1]).name in {'check-private-api.py', 'check-private-web.py'}:
            (ROOT / 'promotion-http-error.log').write_bytes(result.stderr)
        raise RuntimeError('CATALOG_PROMOTION_COMMAND_FAILED')
    return result.stdout.decode().strip()


def sql(statement):
    result = subprocess.run(['docker', 'exec', '-i', DB, 'psql', '-X', '-q', '-A', '-t',
                             '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
                            input=statement.encode(), capture_output=True, timeout=45)
    if result.returncode:
        raise RuntimeError('CATALOG_PROMOTION_SQL_FAILED')
    return result.stdout.decode().strip()


def write_json(path, value):
    temporary = path.with_name(path.name + '.promotion-tmp')
    with temporary.open('x') as handle:
        json.dump(value, handle, indent=2)
        handle.write('\n')
    os.replace(temporary, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--previous', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--retry-rolled-back', action='store_true')
    parser.add_argument('--preserve-handoff', action='store_true')
    args = parser.parse_args()
    if not args.apply or os.geteuid() != 0:
        raise RuntimeError('CATALOG_PROMOTION_REQUIRES_ROOT_APPLY')
    if not re.fullmatch(r'catalog_candidate_[a-z0-9_]{1,32}', args.candidate) or not re.fullmatch(r'catalog_previous_[a-z0-9_]{1,32}', args.previous):
        raise RuntimeError('CATALOG_PROMOTION_NAMES')
    locks = []
    for name in ['comparador-catalog-promotion.lock', 'comparador-catalog-backup.lock', 'comparador-refresh.lock']:
        lock = open('/run/lock/' + name, 'a')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        locks.append(lock)
    if (ROOT / 'updater-enabled').exists():
        raise RuntimeError('CATALOG_PROMOTION_UPDATER_ACTIVE')
    current = json.loads((ROOT / 'migration.json').read_text())
    candidate = json.loads((ROOT / (args.candidate + '-migration.json')).read_text())
    validation = json.loads((ROOT / (args.candidate + '-validation.json')).read_text())
    if current['state'] != 'ready_private' or candidate['state'] != 'ready_private':
        raise RuntimeError('CATALOG_PROMOTION_NOT_VALIDATED')
    if not all(validation.get(key) is True for key in ['allRowsMatchArchive', 'constraintsValidated', 'publicRlsEnabled', 'roleIsolationChecksPassed']):
        raise RuntimeError('CATALOG_PROMOTION_VALIDATION_INCOMPLETE')
    if validation['sourceSha256'] != candidate['sourceSha256'] or current['sourceSha256'] == candidate['sourceSha256']:
        raise RuntimeError('CATALOG_PROMOTION_SOURCE_MISMATCH')
    http_validation = ROOT / (args.candidate + '-web-validation.json')
    if not http_validation.exists() or json.loads(http_validation.read_text()).get('status') != 'passed' or http_validation.stat().st_mtime < datetime.fromisoformat(candidate['validatedAt']).timestamp():
        raise RuntimeError('CATALOG_PROMOTION_REQUIRE_ISOLATED_HTTP_QA')
    if sql(f"select count(*) from pg_database where datname='{args.candidate}';") != '1' or sql(f"select count(*) from pg_database where datname='{args.previous}';") != '0':
        raise RuntimeError('CATALOG_PROMOTION_DATABASE_STATE')
    receipt_path = ROOT / (args.candidate + '-promotion.json')
    if receipt_path.exists():
        old_receipt = json.loads(receipt_path.read_text())
        if not args.retry_rolled_back or old_receipt.get('state') != 'rolled_back' or old_receipt.get('sourceSha256') != candidate['sourceSha256'] or old_receipt.get('previousDatabase') != args.previous:
            raise RuntimeError('CATALOG_PROMOTION_RECEIPT_EXISTS')
        with (ROOT / (args.candidate + '-promotion-rollback-' + str(time.time_ns()) + '.json')).open('xb') as handle:
            handle.write(receipt_path.read_bytes())
    saved = {}
    for filename in ['migration.json', 'validation.json']:
        saved[filename] = (ROOT / filename).read_bytes()
        previous_file = ROOT / (args.previous + '-' + filename)
        if args.retry_rolled_back and previous_file.exists():
            if previous_file.read_bytes() != saved[filename]:
                raise RuntimeError('CATALOG_PROMOTION_PREVIOUS_METADATA_CHANGED')
        else:
            with previous_file.open('xb') as handle:
                handle.write(saved[filename])
    receipt = {'state': 'prepared', 'sourceSha256': candidate['sourceSha256'],
               'candidate': args.candidate, 'previousDatabase': args.previous,
               'startedAt': datetime.now(timezone.utc).isoformat()}
    write_json(receipt_path, receipt)
    swapped = False
    if args.preserve_handoff:
        run(['docker', 'stop', '-t', '15', 'comparador-catalog-gateway'])
    try:
        run(['docker', 'stop', '-t', '15', REST])
        if args.preserve_handoff:
            run(['python3', str(ROOT / 'handoff-overlay.py'), 'apply', '--candidate', args.candidate], 180)
            receipt['handoffOverlay'] = args.candidate + '-overlay.json'
        if sql(f"select count(*) from pg_stat_activity where datname in ('catalog','{args.candidate}');") != '0':
            raise RuntimeError('CATALOG_PROMOTION_UNEXPECTED_CONNECTIONS')
        sql(f'BEGIN; SET LOCAL lock_timeout = \'5s\'; ALTER DATABASE catalog RENAME TO "{args.previous}"; ALTER DATABASE "{args.candidate}" RENAME TO catalog; COMMIT;')
        swapped = True
        candidate['database'] = 'catalog'
        candidate['scope'] = 'active catalog; Cloud Auth and producer handoff separate'
        candidate['promotedAt'] = datetime.now(timezone.utc).isoformat()
        write_json(ROOT / 'migration.json', candidate)
        write_json(ROOT / 'validation.json', validation)
        run(['docker', 'start', REST])
        run(['docker', 'restart', '-t', '10', 'comparador-catalog-api'])
        run(['python3', str(ROOT / 'check-private-api.py')], 90)
        # El reinicio descarta las cachés del snapshot anterior sin renovar observaciones.
        run(['docker', 'restart', '-t', '15', 'comparador-catalog-web'])
        run(['python3', str(ROOT / 'check-private-web.py')], 180)
        receipt['state'] = 'active_http_verified'
        receipt['completedAt'] = datetime.now(timezone.utc).isoformat()
        write_json(receipt_path, receipt)
        print('CATALOG_PROMOTION_HTTP_VERIFIED ' + json.dumps(receipt))
    except Exception:
        if swapped:
            run(['docker', 'stop', '-t', '15', REST])
            sql(f'BEGIN; SET LOCAL lock_timeout = \'5s\'; ALTER DATABASE catalog RENAME TO "{args.candidate}"; ALTER DATABASE "{args.previous}" RENAME TO catalog; COMMIT;')
            for filename, content in saved.items():
                (ROOT / filename).write_bytes(content)
            run(['docker', 'restart', '-t', '15', 'comparador-catalog-web'])
            receipt['state'] = 'rolled_back'
            write_json(receipt_path, receipt)
        raise
    finally:
        run(['docker', 'start', REST])
        if args.preserve_handoff:
            run(['docker', 'start', 'comparador-catalog-gateway'])
        if receipt['state'] == 'rolled_back':
            run(['docker', 'restart', '-t', '10', 'comparador-catalog-api'])


if __name__ == '__main__':
    os.umask(0o077)
    main()
