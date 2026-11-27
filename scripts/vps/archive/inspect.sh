#!/usr/bin/env bash
# Inspección inicial de sólo lectura. No imprime variables, claves ni direcciones.
set -euo pipefail

if [[ ! -r /etc/os-release ]]; then
  printf '%s\n' 'VPS_OS_UNKNOWN' >&2
  exit 1
fi
. /etc/os-release
printf 'os=%s\nversion=%s\narchitecture=%s\n' "$ID" "$VERSION_ID" "$(uname -m)"
printf 'cpu_count=%s\n' "$(getconf _NPROCESSORS_ONLN)"
awk '/^MemTotal:/ { print "memory_kib=" $2 }' /proc/meminfo
df -Pk / | awk 'NR == 2 { print "root_available_kib=" $4 }'
printf 'clock_utc=%s\n' "$(date -u +%FT%TZ)"
printf 'time_synchronized=%s\n' "$(timedatectl show -p NTPSynchronized --value 2>/dev/null || printf unknown)"
printf 'reboot_required=%s\n' "$([[ -f /var/run/reboot-required ]] && printf yes || printf no)"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version 2>/dev/null || true
  # Sólo estado agregado: no volcar inspecciones que incluyan secretos de contenedores.
  if docker info >/dev/null 2>&1; then
    printf 'existing_containers=%s\n' "$(docker ps -aq | wc -l | tr -d ' ')"
  else
    printf '%s\n' 'docker_daemon_access=unavailable'
  fi
else
  printf '%s\n' 'docker=not_installed'
fi
printf 'postgres_installed=%s\n' "$(command -v psql >/dev/null 2>&1 && printf yes || printf no)"
printf 'node_installed=%s\n' "$(command -v node >/dev/null 2>&1 && printf yes || printf no)"

