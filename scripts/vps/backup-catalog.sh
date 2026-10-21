#!/usr/bin/env bash
# Respaldo del candidato local. Nunca toca los backups originales de Supabase.
set -euo pipefail
umask 077
root=/opt/comparador-catalog
destination="$root/backups"
[[ "$EUID" == 0 && -f "$root/migration.json" && -d "$destination" && ! -L "$destination" ]]
python3 -c 'import json; assert json.load(open("/opt/comparador-catalog/migration.json"))["state"] == "ready_private"'
exec 9>/run/lock/comparador-catalog-backup.lock
flock -n 9 || { printf '%s\n' 'CATALOG_BACKUP_ALREADY_RUNNING'; exit 0; }
database_bytes="$(docker exec comparador-catalog-db psql -X -A -t -U postgres -d catalog -c 'select pg_database_size(current_database());')"
[[ "$database_bytes" =~ ^[0-9]+$ ]]
available_kib="$(df -Pk "$destination" | awk 'NR==2 {print $4}')"
required_kib=$((database_bytes * 2 / 1024 + 5 * 1024 * 1024))
if ((available_kib < required_kib)); then
  printf '%s\n' 'CATALOG_BACKUP_INSUFFICIENT_FREE_DISK' >&2
  exit 1
fi
stem="catalog-$(date -u +%Y%m%dT%H%M%SZ)-$$"
partial="$destination/$stem.dump.partial"
completed="$destination/$stem.dump"
trap 'if [[ -f "$partial" ]]; then rm -- "$partial"; fi' EXIT
set -o noclobber
docker exec comparador-catalog-db pg_dump -U postgres -d catalog --format=custom \
  --compress=gzip:6 --no-subscriptions --lock-wait-timeout=15s > "$partial"
# Decodificar todo sin ejecutar SQL ni imprimir datos.
docker exec -i comparador-catalog-db pg_restore --file=/dev/null < "$partial"
mv -- "$partial" "$completed"
sha256sum "$completed" > "$completed.sha256"
python3 - "$destination" <<'PY'
from pathlib import Path
import re
import sys
root = Path(sys.argv[1]).resolve(strict=True)
assert root == Path('/opt/comparador-catalog/backups')
archives = sorted(p for p in root.iterdir() if p.is_file() and not p.is_symlink()
                  and re.fullmatch(r'catalog-[0-9]{8}T[0-9]{6}Z-[0-9]+\.dump', p.name))
# Sólo archivos generados por este servicio; conservar los siete más recientes.
for obsolete in archives[:-7]:
    obsolete.unlink()
    checksum = obsolete.with_name(obsolete.name + '.sha256')
    if checksum.is_file() and not checksum.is_symlink():
        checksum.unlink()
PY
printf 'CATALOG_LOCAL_BACKUP_READY %s\n' "$stem"
