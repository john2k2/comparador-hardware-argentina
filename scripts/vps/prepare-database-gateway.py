#!/usr/bin/env python3
"""Prepara la entrada privada; no crea DNS, rutas públicas ni habilita productores."""
import json
import os
from pathlib import Path

ROOT = Path('/opt/comparador-catalog')
if os.geteuid() != 0 or json.loads((ROOT / 'migration.json').read_text())['state'] != 'ready_private':
    raise RuntimeError('GATEWAY_REQUIRE_VALIDATED_DATABASE')
target = ROOT / 'secrets/gateway-tokens.json'
if target.exists():
    raise RuntimeError('GATEWAY_ALREADY_PREPARED')
keys = json.loads((ROOT / 'secrets/catalog-api-keys.json').read_text())
with os.fdopen(os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as handle:
    json.dump({'anon': keys['anon'], 'service_role': keys['service_role']}, handle)
os.chown(target, 1000, 1000)
state = ROOT / 'state'
state.mkdir(mode=0o755, exist_ok=True)
if (state / 'handoff-ready').exists():
    raise RuntimeError('GATEWAY_UNEXPECTED_HANDOFF_STATE')
print('DATABASE_GATEWAY_PREPARED_PRIVATE')
