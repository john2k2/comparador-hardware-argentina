#!/usr/bin/env bash
# Primera etapa del VPS nuevo: instalar Docker desde su repositorio oficial.
# No inicia la aplicación, no publica puertos ni modifica SSH, usuarios o firewall.
set -euo pipefail
umask 077

if [[ "${1:-}" != --apply || "$#" != 1 ]]; then
  printf '%s\n' 'Uso: sudo bash scripts/vps/install-engine.sh --apply' >&2
  exit 2
fi
if [[ "$EUID" != 0 ]]; then printf '%s\n' 'VPS_ROOT_REQUIRED' >&2; exit 1; fi
. /etc/os-release
if [[ "$ID" != ubuntu || "$VERSION_ID" != 24.04 ]]; then
  printf '%s\n' 'VPS_UBUNTU_2404_REQUIRED' >&2; exit 1
fi
architecture="$(dpkg --print-architecture)"
if [[ "$architecture" != amd64 && "$architecture" != arm64 ]]; then
  printf '%s\n' 'VPS_ARCHITECTURE_UNSUPPORTED' >&2; exit 1
fi
memory_kib="$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)"
available_kib="$(df -Pk / | awk 'NR == 2 { print $4 }')"
if (( memory_kib < 7000000 || available_kib < 20000000 )); then
  printf '%s\n' 'VPS_INSUFFICIENT_RESOURCES' >&2; exit 1
fi
if command -v docker >/dev/null 2>&1; then
  # Nunca sustituir silenciosamente una instalación o un despliegue existente.
  docker info >/dev/null
  docker compose version
  if [[ -n "$(docker ps -aq)" ]]; then
    printf '%s\n' 'VPS_EXISTING_CONTAINERS_REVIEW_REQUIRED' >&2; exit 1
  fi
  printf '%s\n' 'VPS_ENGINE_ALREADY_AVAILABLE'
  exit 0
fi
for package in docker.io docker-compose docker-compose-v2 docker-doc docker-buildx podman-docker containerd runc; do
  if [[ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null || true)" == 'install ok installed' ]]; then
    printf '%s\n' 'VPS_EXISTING_ENGINE_PACKAGES_REVIEW_REQUIRED' >&2; exit 1
  fi
done
if [[ -e /etc/apt/sources.list.d/docker.sources || -e /etc/apt/sources.list.d/docker.list ]]; then
  printf '%s\n' 'VPS_EXISTING_DOCKER_REPOSITORY_REVIEW_REQUIRED' >&2; exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
key_tmp="$(mktemp /etc/apt/keyrings/docker.XXXXXX)"
trap 'rm -f -- "$key_tmp"' EXIT
curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location \
  https://download.docker.com/linux/ubuntu/gpg -o "$key_tmp"
if ! grep -q -- 'BEGIN PGP PUBLIC KEY BLOCK' "$key_tmp"; then
  printf '%s\n' 'VPS_DOCKER_SIGNING_KEY_INVALID' >&2; exit 1
fi
install -m 0644 "$key_tmp" /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: noble
Components: stable
Architectures: $architecture
Signed-By: /etc/apt/keyrings/docker.asc
EOF
chmod 0644 /etc/apt/sources.list.d/docker.sources
apt-get update
apt-get install -y --no-install-recommends docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker info >/dev/null
docker compose version
printf '%s\n' 'VPS_ENGINE_READY_NO_APPLICATION_DEPLOYED'

