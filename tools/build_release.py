"""Empacotamento local por allowlist; nunca inclui instalação/recursos do jogo."""
from __future__ import annotations
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {".json", ".mjs", ".js", ".css", ".hbs", ".html"}


def build(destination: Path | None = None) -> dict:
    module = ROOT / "foundry"
    manifest = json.loads((module / "module.json").read_text(encoding="utf-8"))
    if manifest.get("id") != "rpgup-pillars-importer":
        raise ValueError("ID inesperado no manifesto")
    destination = (destination or ROOT / "dist").resolve()
    destination.mkdir(parents=True, exist_ok=True)
    output = destination / f"rpgup-pillars-importer-{manifest['version']}.zip"
    files = []
    for path in sorted(module.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Symlink recusado: {path}")
        if not path.is_file():
            continue
        relative = path.relative_to(module)
        if path.suffix not in ALLOWED or relative.parts[0] not in {"module.json", "scripts", "styles", "lang", "templates"}:
            raise ValueError(f"Arquivo fora da allowlist do módulo: {relative}")
        files.append((path, relative))
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, relative in files:
            info = zipfile.ZipInfo(relative.as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, path.read_bytes())
    result = {
        "module": manifest["id"], "version": manifest["version"], "archive": output.name,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "files": [relative.as_posix() for _, relative in files],
        "commercialResourcesIncluded": False,
        "foundryIntegrationTested": False,
    }
    (destination / "release.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    print(json.dumps(build(Path(sys.argv[1]) if len(sys.argv) > 1 else None), indent=2))
