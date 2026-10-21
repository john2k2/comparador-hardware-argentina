#!/usr/bin/env python3
"""Prepara secretos exclusivos del VPS; no publica la API ni imprime credenciales."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import subprocess
import time

ROOT = Path('/opt/comparador-catalog')


def private_file(path, value, uid=0):
    if path.exists():
        raise RuntimeError('PRIVATE_API_FILE_EXISTS')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(value)
    os.chown(path, uid, uid)


def main():
    if json.loads((ROOT / 'migration.json').read_text())['state'] != 'ready_private':
        raise RuntimeError('PRIVATE_API_DATABASE_NOT_READY')
    config = ROOT / 'secrets/postgrest.conf'
    keys = ROOT / 'secrets/catalog-api-keys.json'
    if config.exists() or keys.exists():
        raise RuntimeError('PRIVATE_API_ALREADY_PREPARED')
    password, jwt_secret = secrets.token_urlsafe(48), secrets.token_urlsafe(64)
    statement = f"""BEGIN;
ALTER ROLE authenticator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS CONNECTION LIMIT 12 PASSWORD '{password}';
GRANT anon, authenticated, service_role TO authenticator WITH INHERIT FALSE;
ALTER ROLE authenticator SET statement_timeout = '8s';
ALTER ROLE authenticator SET lock_timeout = '2s';
COMMIT;
"""
    result = subprocess.run(['docker', 'exec', '-i', 'comparador-catalog-db', 'psql', '-X', '-q',
                             '-U', 'postgres', '-d', 'catalog', '-v', 'ON_ERROR_STOP=1'],
                            input=statement.encode(), capture_output=True, timeout=30)
    if result.returncode:
        raise RuntimeError('PRIVATE_API_ROLE_SETUP_FAILED')

    def b64(value):
        return base64.urlsafe_b64encode(value).rstrip(b'=')

    def token(role):
        header = b64(b'{"alg":"HS256","typ":"JWT"}')
        payload = b64(json.dumps({'role': role, 'iss': 'comparador-vps',
                                  'iat': int(time.time()), 'exp': int(time.time()) + 31536000},
                                 separators=(',', ':')).encode())
        unsigned = header + b'.' + payload
        return (unsigned + b'.' + b64(hmac.new(jwt_secret.encode(), unsigned, hashlib.sha256).digest())).decode()

    # Sin rol anónimo por defecto: se exige un JWT incluso en la red privada.
    private_file(config, f'''db-uri = "postgres://authenticator:{password}@comparador-catalog-db:5432/catalog"
db-schemas = "public"
db-extra-search-path = "public, extensions"
db-config = false
db-pool = 8
db-max-rows = 1000
jwt-secret = "{jwt_secret}"
server-host = "0.0.0.0"
server-port = 3000
log-level = "warn"
''', 1000)
    private_file(keys, json.dumps({'anon': token('anon'), 'service_role': token('service_role')}))
    print('PRIVATE_API_PREPARED')


if __name__ == '__main__':
    main()
