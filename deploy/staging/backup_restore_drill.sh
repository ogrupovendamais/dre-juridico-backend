#!/bin/sh
set -eu
# Only staging, fixed DB and fixed RESTORE DESTINATION; never use with real records.
[ "${I_CONFIRM_DISPOSABLE_STAGING:-}" = "YES" ] || { echo 'BLOCKED: confirm I_CONFIRM_DISPOSABLE_STAGING=YES' >&2; exit 2; }
cd "$(dirname "$0")"
command -v docker >/dev/null || { echo 'Docker not installed' >&2; exit 2; }
OUT="${1:-./staging-backup.dump}"
[ ! -e "$OUT" ] || { echo 'Refusing to overwrite backup' >&2; exit 2; }
# Dump from dedicated synthetic-only DB to local operator machine.
umask 077
docker compose exec -T db sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec pg_dump -Fc -U dre_staging -d dre_homolog' > "$OUT"
[ -s "$OUT" ] || { echo 'Backup empty' >&2; exit 1; }
# Restore drill in independent fixed DB; abort if already exists to avoid touching existing data.
EXISTS=$(docker compose exec -T db sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -At -U dre_staging -d dre_homolog' <<'SQL'
SELECT 1 FROM pg_database WHERE datname='dre_restore_drill';
SQL
)
[ -z "$EXISTS" ] || { echo 'BLOCKED: dre_restore_drill already exists; do not overwrite' >&2; exit 2; }
docker compose exec -T db sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; createdb -U dre_staging dre_restore_drill'
cat "$OUT" | docker compose exec -T db sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; pg_restore --exit-on-error -U dre_staging -d dre_restore_drill'
docker compose exec -T db sh -ec 'export PGPASSWORD="$POSTGRES_PASSWORD"; exec psql -At -U dre_staging -d dre_restore_drill' <<'SQL'
SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';
SQL
echo 'Restore staged in dre_restore_drill. Inspect manually, then DROP ONLY that disposable database after evidence collection.'
