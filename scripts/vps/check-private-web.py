#!/usr/bin/env python3
"""Comprueba el origen privado y el catálogo real sin imprimir secretos o cuentas."""
import json
import argparse
from pathlib import Path
import re
import time
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path('/opt/comparador-catalog')
token = (ROOT / 'secrets/origin-token').read_text().strip()
parser = argparse.ArgumentParser()
parser.add_argument('--base-url', default='http://127.0.0.1:3100')
parser.add_argument('--receipt', default='web-validation.json')
args = parser.parse_args()
if not re.fullmatch(r'http://(?:127\.0\.0\.1|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3}\.\d{1,3}):3100', args.base_url) or not re.fullmatch(r'[a-z0-9_-]+\.json', args.receipt):
    raise RuntimeError('VPS_WEB_CHECK_ARGUMENTS')


def request(path, authorized=True, method='GET'):
    req = Request(args.base_url + path, method=method,
                  headers={'x-comparador-origin-token': token} if authorized else {})
    try:
        with urlopen(req, timeout=45) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()


for attempt in range(30):
    try:
        if request('/__vps_health', False)[0] == 403:
            break
    except (URLError, ConnectionError, TimeoutError):
        pass
    time.sleep(1)
else:
    raise RuntimeError('VPS_WEB_START_TIMEOUT')
assert request('/__vps_health')[0] == 200
assert request('/api/auth/session')[0] == 404
assert request('/api/admin/operational')[0] == 404
assert request('/api/search?q=ryzen', method='POST')[0] == 405
checks = []
for path in ['/api/search?q=ryzen%207600', '/api/products?category=procesadores',
             '/api/categories', '/api/stores', '/api/home/observed-sections']:
    status, headers, body = request(path)
    assert status == 200, 'VPS_WEB_HTTP_' + path.split('?')[0] + '_' + str(status)
    value = json.loads(body)
    if path.startswith(('/api/search?', '/api/products?')):
        assert isinstance(value.get('products'), list) and len(value['products']) > 0, 'VPS_WEB_EMPTY_CATALOG'
        if path.startswith('/api/search?'):
            product_id = value['products'][0]['id']
    checks.append({'path': path, 'status': status, 'bytes': len(body)})
for path in ['/search?q=ryzen%207600', '/product/' + product_id, '/guia/pc-gamer-1-millon']:
    status, headers, body = request(path)
    assert status == 200 and b'__next_error__' not in body, 'VPS_WEB_DOCUMENT_FAILED'
    assert headers.get('Content-Security-Policy'), 'VPS_WEB_CSP_MISSING'
    for asset in set(re.findall(rb'(?:src|href)="(/_next/static/[^"?]+)', body)):
        asset_status, _, _ = request(asset.decode())
        assert asset_status == 200, 'VPS_WEB_ASSET_FAILED'
    checks.append({'path': path, 'status': status, 'bytes': len(body)})
receipt = {'status': 'passed', 'originAuthRequired': True, 'readOnly': True, 'checks': checks,
           'scope': 'private origin HTTP; public routing checked separately'}
(ROOT / args.receipt).write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
