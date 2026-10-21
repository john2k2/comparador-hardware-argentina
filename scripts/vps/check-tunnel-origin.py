#!/usr/bin/env python3
"""Comprueba HTTPS y autenticación del origen a través de Cloudflare."""
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path('/opt/comparador-catalog')
token = (ROOT / 'secrets/origin-token').read_text().strip()
base = 'https://mac-catalog-private.comparador-hardware.com.ar'
path = '/api/search?q=ryzen%207600'
try:
    with urlopen(Request(base + path, headers={'User-Agent': 'comparador-migration-check/1.0'}), timeout=30) as response:
        unauthorized_status = response.status
except HTTPError as error:
    unauthorized_status = error.code
assert unauthorized_status == 403, 'TUNNEL_ORIGIN_AUTH_REQUIRED'
with urlopen(Request(base + path, headers={'x-comparador-origin-token': token,
                                         'User-Agent': 'comparador-migration-check/1.0'}), timeout=30) as response:
    value = json.load(response)
    assert response.status == 200 and len(value.get('products', [])) > 0, 'TUNNEL_SEARCH_FAILED'
with urlopen(Request(base + '/sitemap-index.xml', headers={'x-comparador-origin-token': token,
                                                        'User-Agent': 'comparador-migration-check/1.0'}), timeout=30) as response:
    assert response.status == 200 and b'<?xml' in response.read(), 'TUNNEL_SITEMAP_FAILED'
receipt = {'httpsVerified': True, 'unauthorizedStatus': unauthorized_status, 'searchStatus': 200,
           'publicCutover': False}
(ROOT / 'tunnel-validation.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
