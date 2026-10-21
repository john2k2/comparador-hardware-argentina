#!/usr/bin/env python3
"""Restaura public/auth en una base desechable; nunca publica puertos ni Auth."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import uuid

IMAGE = "postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826"


def main():
    os.umask(0o077)
    destination = Path(sys.argv[1]).resolve(strict=True)
    if destination.parent != Path("/root/comparador-backups"):
        raise ValueError("Destino fuera de backups")
    manifest = json.loads((destination / "manifest.json").read_text())
    archive = destination / "database.dump"
    with archive.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != manifest["sha256"]:
            raise ValueError("Checksum distinto")
    container = "comparador-restore-qa-" + uuid.uuid4().hex[:12]
    created = False
    prefix = ["docker", "run", "--rm", "--network=none", "--memory=512m", "--cpus=1",
              "--read-only", "--log-driver=none", "--mount",
              f"type=bind,src={destination},dst=/backup,readonly", IMAGE, "pg_restore"]

    def sql(statement):
        result = subprocess.run(["docker", "exec", "-i", container, "psql", "-X", "-q", "-A", "-t",
                                 "-U", "postgres", "-d", "catalog_restore_qa", "-v", "ON_ERROR_STOP=1"],
                                input=statement.encode("utf-8"), capture_output=True, timeout=180, check=False)
        if result.returncode:
            (destination / "restore-query-error.log").write_bytes(result.stderr)
            raise ValueError("Consulta de prueba fallida")
        return result.stdout.decode("utf-8").strip()

    try:
        subprocess.run(["docker", "create", "--name", container, "--network=none", "--memory=2g", "--cpus=2",
                        "--pids-limit=256", "--restart=no", "--log-driver=none",
                        "--mount", f"type=bind,src={destination},dst=/backup,readonly",
                        "-e", "POSTGRES_PASSWORD=isolated-restore-only", "-e", "POSTGRES_DB=catalog_restore_qa",
                        IMAGE, "postgres", "-c", "shared_preload_libraries=pg_stat_statements"],
                       capture_output=True, timeout=30, check=True)
        created = True
        subprocess.run(["docker", "start", container], capture_output=True, timeout=30, check=True)
        for _ in range(60):
            # El servidor temporal de initdb sólo abre un socket Unix. Esperar
            # TCP evita confundirlo con el servidor final que arranca después.
            if subprocess.run(["docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres", "-d", "catalog_restore_qa"],
                              capture_output=True, timeout=5, check=False).returncode == 0:
                break
            time.sleep(1)
        else:
            raise ValueError("Base de prueba no disponible")
        # Sólo nombres de roles: no aplicar ALTER ROLE ni credenciales del origen.
        roles = re.findall(r"^CREATE ROLE ([a-z_][a-z0-9_]*);$", (destination / "roles.sql").read_text(), re.M)
        for role in roles:
            if role != "postgres" and not role.startswith("pg_"):
                sql(f'CREATE ROLE "{role}" NOLOGIN;')
        # La selección por esquema de pg_restore no incluye la creación del
        # namespace en este archivo; prepararlos en la base nueva de prueba.
        # Ubicaciones constatadas en las declaraciones del archivo de origen:
        # pg_trgm está en public y sus índices nombran public.gin_trgm_ops.
        sql('CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions; '
            'CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions; CREATE EXTENSION pg_trgm WITH SCHEMA public; '
            'CREATE EXTENSION pg_stat_statements WITH SCHEMA extensions;')
        restored = subprocess.run(["docker", "exec", container, "pg_restore", "-U", "postgres", "-d", "catalog_restore_qa",
                                   "--schema=auth", "--schema=public", "--schema=extensions", "--no-owner", "--no-privileges",
                                   "--exit-on-error", "--single-transaction", "/backup/database.dump"],
                                  capture_output=True, timeout=1200, check=False)
        (destination / "restore.log").write_bytes(restored.stderr)
        if restored.returncode:
            print("DB_RESTORE_QA_FAILED " + json.dumps({"directory": str(destination), "stage": "restore"}))
            return 1
        # Contar COPY sin imprimir sus filas. Todos pertenecen al mismo snapshot.
        decoder = subprocess.Popen(prefix + ["--data-only", "--schema=public", "--schema=auth", "--file=-", "/backup/database.dump"],
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, encoding="utf-8")
        counts = {}
        active = None
        for line in decoder.stdout:
            if active is not None:
                if line.rstrip("\n") == "\\.":
                    active = None
                else:
                    counts[active] += 1
            else:
                match = re.match(r'^COPY (auth|public)\.([a-z_][a-z0-9_]*) \(.*\) FROM stdin;\n$', line)
                if match:
                    active = match.group(1) + "." + match.group(2)
                    counts[active] = 0
        if decoder.wait(timeout=60) or active is not None or not counts:
            raise ValueError("Lectura de conteos fallida")
        restored_counts = {}
        for table, expected in counts.items():
            actual = int(sql("SELECT count(*) FROM " + table + ";"))
            if actual != expected:
                raise ValueError("Conteos distintos")
            restored_counts[table] = actual
        # FK, índices y triggers se crean dentro de la restauración transaccional.
        invalid_constraints = int(sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace "
                                      "WHERE n.nspname IN ('public','auth') AND NOT c.convalidated;"))
        if invalid_constraints:
            raise ValueError("Hay restricciones sin validar")
        result = {"schemas": ["public", "auth", "extensions"], "dataTableCount": len(counts),
                  "rowCounts": restored_counts, "allCountsMatchArchive": True, "invalidConstraints": 0,
                  "scope": "schema/data restore; owners and ACL intentionally excluded in isolated QA; not production Auth"}
        (destination / "restore-qa.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
        print("DB_RESTORE_QA_PASSED " + json.dumps(result))
        return 0
    finally:
        if created:
            subprocess.run(["docker", "rm", "-f", "-v", container], capture_output=True, timeout=30, check=True)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError):
        print("DB_RESTORE_QA_ERROR")
        sys.exit(1)
