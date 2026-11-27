#!/usr/bin/env bash
# Prueba desechable del esquema; nunca se conecta al origen ni publica puertos.
set -euo pipefail

if [[ "${1:-}" != --apply || $# != 1 ]]; then
  printf '%s\n' 'Uso: bash scripts/vps/test-database.sh --apply' >&2
  exit 2
fi

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
image='postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826'
container="comparador-schema-qa-$(date -u +%Y%m%d%H%M%S)-$$"
docker image inspect "$image" >/dev/null
[[ -f "$project_dir/supabase/tests/bootstrap-local.sql" ]]
input_dir="$(mktemp -d /tmp/comparador-schema-input.XXXXXXXX)"

# Sólo se elimina el contenedor creado por esta ejecución y sus datos de prueba.
created=0
cleanup() {
  if [[ "$created" == 1 ]]; then
    docker rm -f -v "$container" >/dev/null
  fi
  if [[ "$input_dir" == /tmp/comparador-schema-input.* ]]; then
    find "$input_dir" -type f -delete
    find "$input_dir" -depth -type d -empty -delete
  fi
}
trap cleanup EXIT

# Copias temporales LF: respetan los hashes SQL y los includes relativos de psql.
mkdir "$input_dir/migrations" "$input_dir/tests"
for sql_file in "$project_dir"/supabase/{migrations,tests}/*.sql; do
  relative_path="${sql_file#"$project_dir/supabase/"}"
  tr -d '\r' < "$sql_file" > "$input_dir/$relative_path"
done

docker create --name "$container" --network none --memory 1536m --cpus 2 \
  --pids-limit 256 --restart no --log-driver json-file \
  --log-opt max-size=5m --log-opt max-file=2 \
  --tmpfs /var/lib/postgresql/data:rw,size=512m \
  --mount "type=bind,src=$input_dir,dst=/work,readonly" \
  -e POSTGRES_PASSWORD=isolated-qa-only -e POSTGRES_DB=catalog_auth_qa \
  "$image" >/dev/null
created=1
docker start "$container" >/dev/null

ready=0
for ((attempt = 0; attempt < 45; attempt++)); do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d catalog_auth_qa >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "$ready" == 1 ]] || { printf '%s\n' 'QA_DATABASE_NOT_READY' >&2; exit 1; }

run_sql() {
  local relative_path="$1"
  printf 'checking=%s\n' "$relative_path"
  docker exec -e PGPASSWORD=isolated-qa-only "$container" \
    psql -X -h 127.0.0.1 -U postgres -d catalog_auth_qa \
    -v ON_ERROR_STOP=1 -f "/work/$relative_path"
}

run_sql tests/bootstrap-local.sql
migration_count=0
for migration in "$project_dir"/supabase/migrations/*.sql; do
  run_sql "migrations/$(basename -- "$migration")"
  migration_count=$((migration_count + 1))
done

tests=(
  atomic_catalog_offers paginated_catalog numeric_catalog_search ram_catalog_search
  aero_offer_attributes restricted_offer_purchase peripheral_reclassification
  adaptive_payment_conditions complete_computer_categories apu_accessory_categories
  shared_feed_claims idempotent_catalog_completion catalog_inventory_discovery
  inventory_detail_fallback bounded_catalog_queue network_thermal_categories
  current_offer_evidence adaptive_component_window catalog_product_prefilter
  catalog_current_seed catalog_search_lookup user-data-isolation expired_shared_cache
)
for suite in "${tests[@]}"; do
  run_sql "tests/$suite.sql"
done
printf 'QA_DATABASE_PASSED migrations=%s sql_suites=%s\n' "$migration_count" "${#tests[@]}"
