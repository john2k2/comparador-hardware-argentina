"""Apply the artifact in a disposable folder outside the project's Git tree."""

from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import tempfile


bundle = Path(__file__).resolve().parent
root = Path(__file__).resolve().parents[4]
baseline = root / "tmp/ram-kit-f811/baseline"
manifest = json.loads((bundle / "EVIDENCIA.json").read_text())
patch = bundle / "ram-kit.patch"
assert hashlib.sha256(patch.read_bytes()).hexdigest() == manifest["patchSha256"]
proof = {"patchSha256": manifest["patchSha256"], "steps": [], "files": {}}

with tempfile.TemporaryDirectory(prefix="comparador-ram-proof-") as folder:
    work = Path(folder) / "baseline"
    shutil.copytree(baseline, work)
    for flags in [("--check", "--verbose"), ("--verbose",)]:
        result = subprocess.run(
            ["git", "apply", *flags, str(patch)],
            cwd=work,
            capture_output=True,
            text=True,
            check=True,
        )
        assert "Skipped patch" not in result.stderr
        proof["steps"].append(
            {"flags": list(flags), "exitCode": result.returncode, "log": result.stderr}
        )
    for relative, expected in manifest["candidateSha256"].items():
        actual = hashlib.sha256((work / relative).read_bytes()).hexdigest()
        assert actual == expected, relative
        proof["files"][relative] = {"sha256": actual, "matches": True}

proof["environment"] = "temporary directory outside all project Git repositories"
print(json.dumps(proof, indent=2))
