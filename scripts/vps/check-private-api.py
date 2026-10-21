#!/usr/bin/env python3
"""Pruebas HTTP sin imprimir filas privadas ni claves de acceso."""
import json
from pathlib import Path
import time
import subprocess
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path('/opt/comparador-catalog')
keys = json.loads((ROOT / 'secrets/catalog-api-keys.json').read_text())
inspection = subprocess.run(['docker', 'inspect', 'comparador-catalog-api'],
                            check=True, capture_output=True, text=True)
api_ip = json.loads(inspection.stdout)[0]['NetworkSettings']['Networks']['comparador_catalog_private']['IPAddress']
if not api_ip:
    raise RuntimeError('PRIVATE_API_NETWORK_MISSING')


def request(path, key):
    req = Request('http://' + api_ip + ':8080/rest/v1/' + path,
                  headers={'Authorization': 'Bearer ' + key})
    try:
        with urlopen(req, timeout=15) as response:
            return response.status, json.load(response)
    except HTTPError as error:
        return error.code, None


for attempt in range(20):
    try:
        status, rows = request('products?select=id&limit=1', keys['anon'])
        if status == 200:
            break
    except URLError:
        pass
    time.sleep(1)
else:
    raise RuntimeError('PRIVATE_API_NOT_READY')
assert rows and len(rows) == 1, 'PRIVATE_API_PRODUCT_READ'
status, rows = request('user_profiles?select=user_id', keys['anon'])
assert status == 200 and rows == [], 'PRIVATE_API_PRIVATE_ROWS_VISIBLE'
status, rows = request('user_profiles?select=user_id', keys['service_role'])
expected = subprocess.run(['docker', 'exec', 'comparador-catalog-db', 'psql', '-X', '-q', '-A', '-t',
                           '-U', 'postgres', '-d', 'catalog', '-v', 'ON_ERROR_STOP=1',
                           '-c', 'select count(*) from public.user_profiles;'],
                          check=True, capture_output=True, text=True, timeout=30)
expected_profiles = int(expected.stdout.strip())
assert status == 200 and len(rows) == min(expected_profiles, 1000), 'PRIVATE_API_SERVICE_ACCESS'
status, _ = request('products?select=id&limit=1', keys['anon'] + 'invalid')
assert status == 401, 'PRIVATE_API_INVALID_TOKEN'
receipt = {'status': 'passed', 'publicProductRead': True, 'anonymousProfilesHidden': True,
           'serviceProfiles': expected_profiles, 'invalidTokenRejected': True, 'publiclyExposed': False}
(ROOT / 'api-validation.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
