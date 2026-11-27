#!/usr/bin/env python3
"""Comprueba lectura y TLS del origen; recibe la contraseña sólo por stdin."""
import json
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

IMAGE = "postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"
HOST = "aws-1-sa-east-1.pooler.supabase.com"
USER = "postgres.zyiyziubpcpgoqlkcrie"


def client_prefix(directory):
    return ["docker", "run", "--rm", "--read-only", "--cap-drop=ALL",
            "--security-opt=no-new-privileges:true", "--pids-limit=128",
            "--memory=512m", "--cpus=1", "--log-driver=none",
            "--mount", f"type=bind,src={directory},dst=/run/source,readonly",
            "-e", "PGPASSFILE=/run/source/source.pgpass",
            "-e", "PGSSLROOTCERT=/run/source/roots.crt", "-e", "PGSSLMODE=verify-full",
            "-e", "PGCONNECT_TIMEOUT=15", "-e", "PGAPPNAME=comparador-backup",
            "-e", "LC_ALL=C",
            "-e", "PGOPTIONS=-c statement_timeout=900000 -c default_transaction_read_only=on"]


def backup(directory):
    # Archivo de resguardo: incluye internals de Supabase y no se restaura a ciegas.
    parent = Path("/root/comparador-backups")
    parent.mkdir(mode=0o700, exist_ok=True)
    destination = Path(tempfile.mkdtemp(prefix=datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ-"), dir=parent))
    manifest = {"sourceProject": "zyiyziubpcpgoqlkcrie", "format": "pg_dump-custom",
                "image": IMAGE, "startedAt": datetime.now(timezone.utc).isoformat(),
                "state": "running", "restorationVerified": False,
                "scope": "single database; Supabase internals retained; global roles separate"}
    receipt_file = destination / "manifest.json"

    def save():
        receipt_file.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    save()
    common = client_prefix(directory) + ["--mount", f"type=bind,src={destination},dst=/backup"]
    connection = ["-h", HOST, "-p", "5432", "-U", USER, "-w"]
    command = common + [IMAGE, "pg_dump", *connection, "-d", "postgres", "--format=custom",
                        "--compress=gzip:6", "--lock-wait-timeout=15s", "--no-subscriptions",
                        "--file=/backup/database.dump.partial"]
    result = subprocess.run(command, capture_output=True, timeout=1200, check=False)
    # Registro privado: nunca imprime contenido SQL o datos en el chat.
    (destination / "dump.log").write_bytes(result.stderr)
    if result.returncode:
        manifest["state"] = "dump_failed"
        save()
        print("DB_BACKUP_FAILED " + json.dumps({"directory": str(destination)}))
        return 1
    archive = destination / "database.dump"
    (destination / "database.dump.partial").rename(archive)
    archive.chmod(0o600)
    manifest["state"] = "checking_archive"
    save()
    offline = ["docker", "run", "--rm", "--network=none", "--read-only", "--memory=512m", "--cpus=1",
               "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--log-driver=none",
               "--mount", f"type=bind,src={destination},dst=/backup,readonly", IMAGE, "pg_restore"]
    toc = subprocess.run(offline + ["--list", "/backup/database.dump"], capture_output=True, timeout=60, check=False)
    (destination / "archive.list").write_bytes(toc.stdout)
    decoded = subprocess.run(offline + ["--file=/dev/null", "/backup/database.dump"], capture_output=True, timeout=600, check=False)
    if toc.returncode or decoded.returncode or b"TABLE DATA public products " not in toc.stdout or b"TABLE DATA auth users " not in toc.stdout:
        manifest["state"] = "archive_check_failed"
        save()
        print("DB_BACKUP_ARCHIVE_CHECK_FAILED " + json.dumps({"directory": str(destination)}))
        return 1
    manifest["archiveBytes"] = archive.stat().st_size
    with archive.open("rb") as handle:
        manifest["sha256"] = hashlib.file_digest(handle, "sha256").hexdigest()
    # Roles sin contraseñas. Los roles reservados requieren revisión antes de restaurar.
    roles = subprocess.run(common + [IMAGE, "pg_dumpall", *connection, "-l", "postgres",
                           "--roles-only", "--no-role-passwords", "--file=/backup/roles.sql"],
                           capture_output=True, timeout=90, check=False)
    (destination / "roles.log").write_bytes(roles.stderr)
    if (destination / "roles.sql").exists():
        (destination / "roles.sql").chmod(0o600)
    manifest["rolesExportedWithoutPasswords"] = roles.returncode == 0
    manifest["state"] = "archive_checked" if roles.returncode == 0 else "archive_checked_roles_pending"
    manifest["completedAt"] = datetime.now(timezone.utc).isoformat()
    save()
    print("DB_BACKUP_ARCHIVE_READY " + json.dumps({"directory": str(destination), **manifest}))
    return 0


def main():
    os.umask(0o077)
    payload = json.load(sys.stdin)
    password = payload.get("password", "")
    if not isinstance(password, str) or not 1 <= len(password) <= 4096 or any(c in password for c in "\r\n\0"):
        print("DB_CREDENTIAL_INPUT_INVALID")
        return 2
    with tempfile.TemporaryDirectory(prefix="comparador-source-check-", dir="/run") as directory:
        secret_dir = Path(directory)
        escaped = password.replace("\\", "\\\\").replace(":", "\\:")
        (secret_dir / "source.pgpass").write_text(f"{HOST}:5432:postgres:{USER}:{escaped}\n", encoding="utf-8")
        roots = Path("/etc/ssl/certs/ca-certificates.crt").read_bytes()
        vendor_ca = Path(__file__).with_name("supabase-ca.crt").read_bytes()
        (secret_dir / "roots.crt").write_bytes(roots + b"\n" + vendor_ca)
        if sys.argv[1:] == ["--backup"]:
            return backup(directory)
        if sys.argv[1:]:
            print("DB_ACTION_INVALID")
            return 2
        query = """begin read only;
select json_build_object('database',current_database(),
  'serverVersion',current_setting('server_version'),
  'readOnly',current_setting('transaction_read_only'),
  'poolerBackendTls',(select ssl from pg_stat_ssl where pid=pg_backend_pid()));
rollback;"""
        command = client_prefix(directory) + [IMAGE, "psql", "-X", "-A", "-t", "-q", "-w", "-h", HOST,
                   "-p", "5432", "-U", USER, "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", query,
                   "-c", "\\conninfo"]
        result = subprocess.run(command, capture_output=True, timeout=60, check=False)
        if result.returncode:
            error = result.stderr.decode("utf-8", errors="replace").lower()
            code = "DB_CONNECTION_FAILED"
            if "password authentication failed" in error:
                code = "DB_PASSWORD_REJECTED"
            elif "certificate" in error or "ssl error" in error:
                code = "DB_TLS_CHECK_FAILED"
            elif "timeout" in error or "timed out" in error:
                code = "DB_CONNECTION_TIMEOUT"
            print(code)
            return 1
        output = result.stdout.decode("utf-8").strip().splitlines()
        receipt = json.loads(output[0])
        # pg_stat_ssl refleja el tramo pooler->Postgres, no la conexión del cliente.
        # La conexión de psql exige verify-full y se corrobora con su propio conninfo.
        client_tls = any("SSL connection (protocol: TLSv1." in line for line in output[1:])
        if not client_tls or receipt.get("readOnly") != "on" or receipt.get("database") != "postgres":
            print("DB_CONNECTION_GUARD_FAILED")
            return 1
        receipt["clientTlsVerified"] = True
        print("DB_SOURCE_READ_READY " + json.dumps(receipt))
        return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.TimeoutExpired):
        # No volcar excepciones: podrían incluir entrada o parámetros privados.
        print("DB_SOURCE_CHECK_ERROR")
        sys.exit(1)
