"""Prueba acotada de lectura pública. No escribe catálogo ni conserva cookies."""

import argparse
import hashlib
import json
import os
import platform
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import curl_cffi
from curl_cffi import requests


URLS = [
    "https://fullh4rd.com.ar/prod/29893/placa-de-video-geforce-rtx-5080-16gb-asus-prime-oc-edition",
    "https://fullh4rd.com.ar/prod/29681/placa-de-video-geforce-rtx-5080-16gb-msi-gaming-trio-oc",
    "https://fullh4rd.com.ar/prod/30054/placa-de-video-geforce-rtx-5070-ti-16gb-msi-shadow-3x-oc",
    "https://fullh4rd.com.ar/prod/29894/placa-de-video-geforce-rtx-5070-ti-16gb-asus-prime-oc-edition",
    "https://fullh4rd.com.ar/prod/30305/placa-de-video-geforce-rtx-5060-ti-16gb-asus-prime-oc-edition",
    "https://fullh4rd.com.ar/cat/supra/3/placas-de-video/1",
]
MAX_BYTES = 8 * 1024 * 1024
MAX_REQUESTS = 8


def now():
    return datetime.now(timezone.utc).isoformat()


def allowed(url):
    value = urlsplit(url)
    return (value.scheme == "https"
            and value.hostname in {"fullh4rd.com.ar", "www.fullh4rd.com.ar"}
            and value.port in {None, 443}
            and not value.username and not value.password)


def challenge(body):
    # El endpoint RUM solo no prueba un desafío: buscar señales de la página.
    return bool(re.search(
        r"cf-chl-|/cdn-cgi/challenge-platform/|<title>\s*(?:Just a moment|Un momento)",
        body.decode("utf-8", errors="replace"), re.I))


def save(path, value):
    with path.open("xb") as output:
        os.chmod(path, 0o600)
        output.write(value)


def probe(output, limit):
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    receipt = {"startedAt": now(), "pid": os.getpid(), "python": platform.python_version(),
               "architecture": platform.machine(), "curlCffi": curl_cffi.__version__,
               "profile": "chrome", "initialCookies": 0, "cookiePersistence": False,
               "catalogWrites": 0, "requests": [], "stopReason": None}
    with requests.Session(impersonate="chrome", verify=True, trust_env=False) as session:
        receipt["initialCookies"] = len(session.cookies)
        for target in URLS[:limit]:
            current, redirects = target, 0
            while True:
                if not allowed(current):
                    receipt["stopReason"] = "disallowed-redirect"
                    break
                if len(receipt["requests"]) >= MAX_REQUESTS:
                    receipt["stopReason"] = "request-budget"
                    break
                if receipt["requests"]:
                    time.sleep(3)
                entry = {"target": target, "url": current, "startedAt": now()}
                chunks, received = [], 0

                def collect(chunk):
                    nonlocal received
                    received += len(chunk)
                    if received > MAX_BYTES:
                        raise ValueError("response-size-limit")
                    chunks.append(chunk)
                    return len(chunk)

                try:
                    response = session.get(current, timeout=20, allow_redirects=False,
                                           content_callback=collect)
                    body = b"".join(chunks)
                    entry.update({"receivedAt": now(), "status": response.status_code,
                                  "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                                  "contentType": response.headers.get("Content-Type"),
                                  "challenge": challenge(body)})
                    filename = f"response-{len(receipt['requests']) + 1}.html"
                    save(output / filename, body)
                    entry["bodyFile"] = filename
                    receipt["requests"].append(entry)
                    if response.status_code in {403, 429} or entry["challenge"]:
                        receipt["stopReason"] = "blocked"
                        break
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("Location")
                        if not location or redirects >= 3:
                            receipt["stopReason"] = "redirect-limit"
                            break
                        current = urljoin(current, location)
                        redirects += 1
                        continue
                    if response.status_code != 200:
                        receipt["stopReason"] = "http-error"
                    elif "text/html" not in (entry["contentType"] or "").lower():
                        receipt["stopReason"] = "unexpected-content-type"
                    break
                except Exception as error:
                    # No registrar credenciales, cookies ni texto arbitrario del transporte.
                    entry.update({"receivedAt": now(), "errorType": type(error).__name__})
                    receipt["requests"].append(entry)
                    receipt["stopReason"] = "transport-error"
                    break
            if receipt["stopReason"]:
                break
    receipt["finishedAt"] = now()
    save(output / "receipt.json", json.dumps(receipt, indent=2).encode())
    print(json.dumps(receipt, indent=2))
    return 0 if receipt["stopReason"] is None else 2


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, choices=range(1, 7), default=1)
    args = parser.parse_args()
    raise SystemExit(probe(args.output, args.limit))
