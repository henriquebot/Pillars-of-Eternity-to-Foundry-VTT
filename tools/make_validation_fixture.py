"""Gera recursos próprios para teste real isolado; não são conteúdo de Pillars."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--world-id", default="rpgup-fixture-test", help="ID de um mundo descartável autorizado")
args = parser.parse_args()
if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", args.world_id):
    parser.error("world-id deve ser um ID simples, sem barras ou caminhos")
OUT = ROOT / "local" / "validation"
OUT.mkdir(parents=True, exist_ok=True)


def chunk(kind, payload):
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))


width, height = 800, 600
rows = []
for y in range(height):
    row = bytearray()
    for x in range(width):
        grid = x % 100 == 0 or y % 100 == 0
        color = (90, 130, 160) if grid else (30, 42, 52)
        row.extend(color)
    rows.append(b"\0" + bytes(row))
png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"".join(rows))) + chunk(b"IEND", b"")
(OUT / "rpgup-fixture.png").write_bytes(png)
timestamp = "2026-11-01T00:00:00Z"


def entity(kind, key, title, data):
    return {"id": f"synthetic:{key}", "kind": kind, "sourceId": key,
            "name": {"pt-BR": title},
            "provenance": {"source": "synthetic-fixture", "sourceId": key,
                           "sha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
                           "extractedAt": timestamp, "status": "manual"}, "data": data}


bundle = {"schemaVersion": "1.0.0", "id": "rpgup-synthetic-runtime-validation",
          "source": {"game": "pillars-of-eternity", "synthetic": True, "language": "pt-BR", "extractedAt": timestamp},
          "entities": [
              entity("map", "grid", "[FIXTURE PRÓPRIA] Grade de teste", {"image": f"worlds/{args.world_id}/rpgup-fixture.png", "width": width, "height": height, "grid": {"size": 100, "type": 1, "distance": 5, "units": "ft"}, "combatValidated": False}),
              entity("quest", "quest", "[FIXTURE PRÓPRIA] Quest de teste", {"publicText": "Texto público próprio, criado para o teste. Não pertence a Pillars.\nMarcação inerte: @UUID[Actor.synthetic]{teste} [[1d6]] <script>inert</script>", "gmText": "SEGREDO_FIXTURE_NAO_PUBLICAR", "region": "Fixtures próprias", "act": "TESTE", "automation": "manual-only"}),
              entity("dialogue", "dialogue", "[FIXTURE PRÓPRIA] Conversa privada", {"gmText": "SEGREDO_DIALOGO_FIXTURE", "nodes": [{"id": 0, "texts": {"pt-BR": {"defaultText": "Own synthetic line.", "translationMissing": True, "language": "en"}}, "links": [{"from": 0, "to": 1}, {"from": 0, "to": 2}]}], "automation": "manual-only"}),
          ]}
(OUT / "synthetic-campaign.json").write_text(json.dumps(bundle, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(OUT)
