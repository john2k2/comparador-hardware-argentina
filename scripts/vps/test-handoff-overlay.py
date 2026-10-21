#!/usr/bin/env python3
"""QA transaccional con tablas temporales: no modifica las tablas de producción."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('handoff', Path(__file__).with_name('handoff-overlay.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

original = {'requested_offer_refreshes': [], 'api_cache_entries': [], 'api_rate_limits': []}
request = {'id': '00000000-0000-4000-8000-000000000001', 'fingerprint': 'qa', 'requester_hash': 'a' * 64,
           'targets': [{'productId': 'qa', 'storeId': 'qa', 'url': 'https://example.com/qa'}], 'status': 'queued',
           'results': [], 'created_at': '2026-10-21T00:00:00Z', 'started_at': None, 'finished_at': None,
           'expires_at': '2026-10-21T00:30:00Z', 'lease_token': None}
rate = {'bucket_key': 'qa', 'count': 2, 'window_end': '2026-10-21T00:30:00Z',
        'created_at': '2026-10-21T00:00:00Z', 'updated_at': '2026-10-21T00:00:00Z'}
cache = {'cache_key': "qa'quoted", 'scope': 'qa', 'payload': {'message': "texto ' y \\"},
         'expires_at': '2026-10-21T00:30:00Z', 'created_at': '2026-10-21T00:00:00Z', 'updated_at': '2026-10-21T00:00:00Z'}
original['api_rate_limits'] = [rate]
original['api_cache_entries'] = [cache]
expired = {**request, 'id': '00000000-0000-4000-8000-000000000002'}
original['requested_offer_refreshes'] = [expired]
after = {'requested_offer_refreshes': [request, {**expired, 'status': 'failed'}],
         'api_rate_limits': [{**rate, 'count': 5}], 'api_cache_entries': []}
statements, counts = module.overlay_statements(original, after, prefix='pg_temp.')
assert counts['requested_offer_refreshes']['upserts'] == 1
assert counts['api_rate_limits']['upserts'] == 1
setup = ['BEGIN; SET LOCAL standard_conforming_strings=on;']
for table in module.KEYS:
    setup.append(f'CREATE TEMP TABLE {table} (LIKE public.{table} INCLUDING ALL) ON COMMIT DROP;')
for table, value in [('api_cache_entries', [cache]), ('api_rate_limits', [{**rate, 'count': 7}]), ('requested_offer_refreshes', [{**expired, 'status': 'completed'}])]:
    setup.append(f'INSERT INTO pg_temp.{table} SELECT * FROM jsonb_populate_recordset(NULL::pg_temp.{table}, {module.literal(value)});')
checks = """
SELECT jsonb_build_object(
'newRequest', (SELECT count(*)=1 FROM pg_temp.requested_offer_refreshes WHERE id='00000000-0000-4000-8000-000000000001' AND status='queued'),
'oldSourceStatus', (SELECT status='completed' FROM pg_temp.requested_offer_refreshes WHERE id='00000000-0000-4000-8000-000000000002'),
'rateDelta', (SELECT count=10 FROM pg_temp.api_rate_limits WHERE bucket_key='qa'),
'cacheDeletion', (SELECT count(*)=0 FROM pg_temp.api_cache_entries));
ROLLBACK;
"""
result = json.loads(module.sql('catalog', '\n'.join(setup + statements) + checks))
assert all(result.values()), 'HANDOFF_OVERLAY_QA_FAILED'
print('HANDOFF_OVERLAY_QA_PASSED ' + json.dumps(result))
