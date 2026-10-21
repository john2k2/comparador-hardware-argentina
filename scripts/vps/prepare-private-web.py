#!/usr/bin/env python3
"""Crea la configuración de lectura; nunca entrega service_role al servidor web."""
import json
from pathlib import Path
import secrets
from importlib.util import spec_from_file_location, module_from_spec

ROOT = Path('/opt/comparador-catalog')
spec = spec_from_file_location('private_api', ROOT / 'prepare-private-api.py')
module = module_from_spec(spec)
spec.loader.exec_module(module)
keys = json.loads((ROOT / 'secrets/catalog-api-keys.json').read_text())
module.private_file(ROOT / 'secrets/web-runtime.json', json.dumps({
    'SUPABASE_URL': 'http://api:8080', 'SUPABASE_PUBLISHABLE_KEY': keys['anon'],
    'SUPABASE_AUTH_URL': 'https://zyiyziubpcpgoqlkcrie.supabase.co',
    'SUPABASE_AUTH_PUBLISHABLE_KEY': 'sb_publishable_YarIgxU8K--eKMJMsRrB6g_Ka-7xj40',
    'SITE_URL': 'https://www.comparador-hardware.com.ar', 'ENEBA_AFFILIATE_PILOT_ENABLED': '1',
}), 1000)
module.private_file(ROOT / 'secrets/origin-token', secrets.token_urlsafe(48), 1000)
print('PRIVATE_WEB_PREPARED')
