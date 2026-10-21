#!/bin/sh
# Un único productor y recibos privados. Se instala detenido hasta el corte.
set -eu
umask 077
mode=${1:-}
case "$mode" in adaptive|guides|priority|requested) ;; *) exit 64 ;; esac
root=/opt/comparador-catalog
test -f "$root/updater-enabled"
exec 9>/run/lock/comparador-refresh.lock
flock -n -E 75 9
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="${mode}-${stamp}"
docker run --rm --name comparador-refresh-job --memory=1536m --cpus=1.5 --pids-limit=256 \
  --cap-drop=ALL --security-opt=no-new-privileges:true \
  --network=comparador_web_egress --network=comparador_catalog_private \
  --log-driver=json-file --log-opt=max-size=10m --log-opt=max-file=2 \
  --mount "type=bind,src=$root/secrets/runner-runtime.json,dst=/run/private/runner-runtime.json,readonly" \
  --mount "type=bind,src=$root/receipts,dst=/receipts" \
  comparador-web:20261020-candidate node scripts/vps/catalog-runner.mjs "$mode" "/receipts/$name.json"
