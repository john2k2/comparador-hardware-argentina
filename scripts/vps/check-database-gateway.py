#!/usr/bin/env python3
"""Contrasta autenticación y RLS de la entrada nueva sin escribir datos."""
import json
import argparse
from pathlib import Path
import subprocess
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

root = Path('/opt/comparador-catalog')
parser = argparse.ArgumentParser()
parser.add_argument('--public', action='store_true')
args = parser.parse_args()
keys = json.loads((root / 'secrets/catalog-api-keys.json').read_text())
info = json.loads(subprocess.run(['docker', 'inspect', 'comparador-catalog-gateway'], check=True, capture_output=True).stdout)[0]
address = info['NetworkSettings']['Networks']['comparador_catalog_private']['IPAddress']
base_url = 'https://catalog-api.comparador-hardware.com.ar' if args.public else 'http://' + address + ':8081'


def request(path, role=None):
    headers = {'User-Agent': 'comparador-migration-check/1.0'}
    if role:
        headers['Authorization'] = 'Bearer ' + keys[role]
    try:
        with urlopen(Request(base_url + path, headers=headers), timeout=15) as response:
            return response.status, response.read()
    except HTTPError as error:
        return error.code, error.read()


for attempt in range(20):
    try:
        if request('/rest/v1/products?select=id&limit=1')[0] == 401:
            break
    except URLError:
        pass
    time.sleep(1)
else:
    raise RuntimeError('GATEWAY_START_TIMEOUT')
assert request('/rest/v1/products?select=id&limit=1', 'service_role')[0] == 200
assert request('/rest/v1/products?select=id&limit=1', 'anon')[0] == 200
status, body = request('/rest/v1/user_profiles?select=user_id', 'anon')
assert status == 200 and json.loads(body) == [], 'GATEWAY_PRIVATE_PROFILE_VISIBLE'
if not args.public:
    assert request('/auth/v1/user', 'service_role')[0] == 404
ready_status = request('/__ready', 'service_role')[0]
assert ready_status == (200 if (root / 'state/handoff-ready').exists() else 503)
receipt = {'status': 'passed', 'authenticationRequired': True, 'publicCatalogRead': True,
           'anonymousProfilesHidden': True, 'authEndpointBlocked': True, 'handoffReady': ready_status == 200,
           'scope': 'public HTTPS gateway' if args.public else 'private gateway; public ingress not configured by this check'}
(root / ('gateway-public-validation.json' if args.public else 'gateway-validation.json')).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
