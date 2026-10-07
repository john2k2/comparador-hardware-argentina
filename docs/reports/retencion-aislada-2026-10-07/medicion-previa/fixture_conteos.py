"""Prueba sintética de conteos; no conecta a DB ni mide ahorro/runtime."""
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from random import Random
import json

UTC = timezone.utc
CUTOFF = datetime(2026, 10, 7, 15, 45, tzinfo=UTC)
RAW, HOURLY, DAILY = (CUTOFF-timedelta(days=n) for n in (14, 90, 365))

def band(t):
    return "raw" if t >= RAW else "hourly" if t >= HOURLY else "daily" if t >= DAILY else "old"

def bucket(t, kind):
    t = t.astimezone(UTC)
    return t.replace(minute=0, second=0, microsecond=0) if kind == "hourly" else t.replace(hour=0, minute=0, second=0, microsecond=0)

def key(row, kind):
    return row["product"], row["store"], row["url"] or "", bucket(row["at"], kind)

def reference(rows):
    winners = {}
    for kind in ("hourly", "daily"):
        groups = defaultdict(list)
        for row in rows:
            groups[key(row, kind)].append(row)
        for k, members in groups.items():
            winners[kind, k] = max(members, key=lambda r: (r["at"], r["id"]))["id"]
    result = {}
    for row in rows:
        kind = band(row["at"])
        result[row["id"]] = kind == "old" or (
            kind in ("hourly", "daily") and winners[kind, key(row, kind)] != row["id"]
        )
    return result

def counted_groups(rows, restricted):
    result = {"raw": 0, "hourly": 0, "daily": 0, "old": sum(band(r["at"]) == "old" for r in rows)}
    for kind, lower, upper, width in (
        ("hourly", HOURLY, RAW, timedelta(hours=1)),
        ("daily", DAILY, HOURLY, timedelta(days=1)),
    ):
        groups = defaultdict(list)
        for row in rows:
            t = row["at"]
            if not restricted or bucket(lower, kind) <= t < bucket(upper, kind)+width:
                groups[key(row, kind)].append(row)
        for members in groups.values():
            eligible = sum(lower <= row["at"] < upper for row in members)
            latest = max(row["at"] for row in members)
            result[kind] += eligible - int(lower <= latest < upper)
    return result

def check(rows):
    actual = reference(rows)
    expected = {k: sum(actual[r["id"]] and band(r["at"]) == k for r in rows) for k in ("raw", "hourly", "daily", "old")}
    assert counted_groups(rows, False) == expected
    assert counted_groups(rows, True) == expected
    totals = {k: sum(band(r["at"]) == k for r in rows) for k in expected}
    assert sum(totals.values()) == len(rows)
    assert sum(expected.values()) + sum(not v for v in actual.values()) == len(rows)
    selected = sorted((r for r in rows if r["at"] < RAW), key=lambda r:r["id"])[:1000]
    for row in selected:
        kind = band(row["at"])
        # Existe cualquier ganador mayor global, aunque quede fuera de la ventana.
        exists_newer = kind == "old" or any(
            key(other, kind) == key(row, kind) and (other["at"], other["id"]) > (row["at"], row["id"])
            for other in rows
        )
        assert exists_newer == actual[row["id"]]
    assert sum(actual[r["id"]] for r in selected) <= sum(actual.values())
    return {"fixture_rows":len(rows), "fixture_candidates":sum(expected.values()), "window_rows":len(selected)}

rows = []
def add(t, product="p", store="s", url="offer"):
    rows.append({"id":f"{len(rows)+1:032x}", "at":t, "product":product, "store":store, "url":url})

# Límites exactos y buckets que cruzan 14/90/365 días; empates de timestamp/id.
for limit in (RAW, HOURLY, DAILY):
    for offset in (-3601, -1, 0, 0, 1, 3601):
        add(limit+timedelta(seconds=offset))
# NULL y vacío comparten oferta; otra URL/tienda/producto conservan identidad.
add(RAW-timedelta(minutes=5), url=None)
add(RAW+timedelta(minutes=5), url="")
add(RAW-timedelta(minutes=5), url="other")
add(RAW-timedelta(minutes=5), store="other")
add(RAW-timedelta(minutes=5), product="other")
add(CUTOFF+timedelta(hours=1))
# Offset distinto que representa el mismo instante UTC.
add(datetime.fromisoformat("2026-07-09T12:45:00-03:00"))

checks = [check(rows)]
rng = Random(20261007)
for _ in range(1400):
    t = CUTOFF-timedelta(days=rng.randrange(410), minutes=rng.randrange(1440))
    add(t, product=f"p{rng.randrange(4)}", store=f"s{rng.randrange(2)}", url=rng.choice([None,"","offer","other"]))
    if rng.randrange(8) == 0:
        add(t, product=rows[-1]["product"], store=rows[-1]["store"], url=rows[-1]["url"])
checks.append(check(rows))
print(json.dumps({"mode":"synthetic only; no production counts", "cutoff":CUTOFF.isoformat(), "checks":checks, "passed":True}, indent=2))
