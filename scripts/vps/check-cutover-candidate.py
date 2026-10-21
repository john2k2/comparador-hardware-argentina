#!/usr/bin/env python3
"""Prueba una base candidata con una pila HTTP desechable y sin rutas públicas."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path('/opt/comparador-catalog')
REST_IMAGE = 'postgrest/postgrest@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf'
API_IMAGE = 'nginx@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5'
NETWORK = 'comparador_catalog_private'


def run(command, timeout=60):
    result = subprocess.run(command, capture_output=True, timeout=timeout)
    if result.returncode:
        # Guardar diagnóstico local; no imprimir configuración, headers ni filas.
        (ROOT / 'candidate-http-error.log').write_bytes(result.stderr)
        raise RuntimeError('CANDIDATE_HTTP_COMMAND_FAILED')
    return result.stdout.decode().strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate', required=True)
    parser.add_argument('--diagnose-recent', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'catalog_candidate_[a-z0-9_]{1,32}', args.candidate):
        raise RuntimeError('CANDIDATE_HTTP_NAME')
    receipt = json.loads((ROOT / (args.candidate + '-migration.json')).read_text())
    if receipt['state'] != 'ready_private':
        raise RuntimeError('CANDIDATE_HTTP_NOT_VALIDATED')
    config_dir = ROOT / 'secrets/candidate-http'
    config_dir.mkdir(mode=0o700)
    # Los contenedores necesitan atravesar el directorio para leer sus archivos privados.
    config_dir.chmod(0o711)
    configs = {
        'postgrest.conf': (ROOT / 'secrets/postgrest.conf').read_text().replace(':5432/catalog"', ':5432/' + args.candidate + '"'),
        'nginx.conf': (ROOT / 'api-nginx.conf').read_text().replace('server rest:3000 resolve;', 'server candidate-rest:3000 resolve;'),
    }
    runtime = json.loads((ROOT / 'secrets/web-runtime.json').read_text())
    runtime['SUPABASE_URL'] = 'http://candidate-api:8080'
    configs['web-runtime.json'] = json.dumps(runtime)
    containers = []
    try:
        for name, value in configs.items():
            path = config_dir / name
            with path.open('x') as handle:
                handle.write(value)
            os.chown(path, 1000 if name != 'nginx.conf' else 101, 1000 if name != 'nginx.conf' else 101)
        common = ['docker', 'run', '-d', '--network', NETWORK, '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '--pids-limit=256', '--log-opt=max-size=2m', '--log-opt=max-file=1']
        for name, alias, options in [
            ('comparador-candidate-rest', 'candidate-rest', ['--user=1000:1000', '--read-only', '--memory=256m', '--cpus=1', '--mount', f'type=bind,src={config_dir}/postgrest.conf,dst=/run/private/postgrest.conf,readonly', '--entrypoint=/bin/postgrest', REST_IMAGE, '/run/private/postgrest.conf']),
            ('comparador-candidate-api', 'candidate-api', ['--user=101:101', '--read-only', '--memory=64m', '--cpus=0.5', '--tmpfs=/tmp:size=16m,mode=1777', '--mount', f'type=bind,src={config_dir}/nginx.conf,dst=/etc/nginx/nginx.conf,readonly', '--entrypoint=nginx', API_IMAGE, '-g', 'daemon off;']),
            ('comparador-candidate-web', 'candidate-web', ['--memory=1536m', '--cpus=1.5', '--mount', f'type=bind,src={config_dir}/web-runtime.json,dst=/run/private/web-runtime.json,readonly', '--mount', f'type=bind,src={ROOT}/secrets/origin-token,dst=/run/private/origin-token,readonly', 'comparador-web:20261020-candidate']),
        ]:
            run(common + ['--name', name, '--network-alias', alias] + options)
            containers.append(name)
        info = json.loads(run(['docker', 'inspect', 'comparador-candidate-web']))[0]
        ip = info['NetworkSettings']['Networks'][NETWORK]['IPAddress']
        diagnostic = r'''
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import {nodeServerBuildOptions} from './scripts/lib/node-server-build.mjs';
Object.assign(process.env, JSON.parse(readFileSync('/run/private/web-runtime.json','utf8')), {CATALOG_READ_BACKEND:'supabase',CATALOG_NODE_ORIGIN:'1'});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
 const response = await originalFetch(...args);
 if (!response.ok) { const value = await response.clone().json().catch(()=>({})); console.log(JSON.stringify({diagnostic:'recent-http',status:response.status,code:value.code})); }
 return response;
};
await build(nodeServerBuildOptions({stdin:{contents:`
import {readRecentOfferProductSelection} from './src/lib/persistence/recent-offer-products';
import {pickLatestOfferProducts} from './src/lib/home/latest-offers';
import {decodeObservedHome} from './src/lib/home/observed-snapshot';
try {
 const result=await readRecentOfferProductSelection();
 console.log(JSON.stringify({diagnostic:'recent-selection',coverage:result.coverage}));
 const latest=pickLatestOfferProducts(result.products);
 const snapshot=decodeObservedHome({kind:'public-home',data:{collectedAt:new Date().toISOString(),latestOfferProducts:latest,priceDropProducts:[],priceDropFallbackUsed:true}});
 console.log(JSON.stringify({diagnostic:'recent-decode',latest:latest.length,valid:!!snapshot}));
}catch(error){console.log(JSON.stringify({diagnostic:'recent-error',code:/^[A-Z_]+$/.test(error.message)?error.message:'OTHER_ERROR'}));}
`,resolveDir:process.cwd(),loader:'ts'},outfile:'scripts/vps/.candidate-recent-debug.mjs',logLevel:'silent'}));
await import('./scripts/vps/.candidate-recent-debug.mjs');
'''
        if args.diagnose_recent:
            print(run(['docker', 'exec', 'comparador-candidate-web', 'node', '--input-type=module', '-e', diagnostic], 60), flush=True)
        run(['python3', str(ROOT / 'check-private-web.py'), '--base-url', 'http://' + ip + ':3100', '--receipt', args.candidate + '-web-validation.json'], 180)
        print('CANDIDATE_PRIVATE_HTTP_VERIFIED')
    except Exception:
        if 'comparador-candidate-api' in containers:
            logs = subprocess.run(['docker', 'logs', '--tail=12', 'comparador-candidate-api'], capture_output=True, timeout=15)
            for line in logs.stderr.decode(errors='replace').splitlines():
                if '[error]' in line:
                    print('CANDIDATE_PROXY_ERROR ' + line.split(', client:')[0], flush=True)
        raise
    finally:
        for name in reversed(containers):
            subprocess.run(['docker', 'rm', '-f', name], capture_output=True, timeout=60)
        for name in configs:
            path = config_dir / name
            if path.is_file() and not path.is_symlink():
                path.unlink()
        config_dir.rmdir()


if __name__ == '__main__':
    os.umask(0o077)
    main()
