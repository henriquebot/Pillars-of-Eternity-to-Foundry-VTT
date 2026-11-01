"""Conta somente entidades efetivamente presentes no IR. Não estima importações."""
from __future__ import annotations
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

KINDS = {
    "map": "Mapas", "pin": "Pinos", "npc": "NPCs", "item": "Itens",
    "container": "Contêineres", "quest": "Quests", "dialogue": "Diálogos",
    "transition": "Entradas e saídas", "encounter": "Encontros", "lore": "Textos de lore",
}


def coverage(campaign: dict | None = None) -> dict:
    entities = (campaign or {}).get("entities", [])
    identifiers = [entity["id"] for entity in entities]
    if len(identifiers) != len(set(identifiers)):
        raise ValueError("IR contém IDs duplicados")
    found = Counter(entity["kind"] for entity in entities)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "basis": "processed-ir" if campaign is not None else "no-game-data-processed",
        "campaignId": (campaign or {}).get("id"),
        "foundryRuntimeExecuted": False,
        "rows": [dict(kind=kind, label=label, found=found[kind], imported=0, validated=0, pending=found[kind]) for kind, label in KINDS.items()],
        "limitations": [
            "Encontrados conta apenas entidades no IR processado, não todo o conteúdo existente no jogo.",
            "Importados/validados ficam em zero enquanto não houver execução e evidências reais do Foundry.",
            "Fixtures sintéticas não representam cobertura do jogo e não devem alimentar o relatório de campanha.",
        ],
    }


def markdown(report: dict) -> str:
    text = ["# Cobertura de conteúdo", "", f"Base: `{report['basis']}`. Gerado: {report['generatedAt']}.", "", "| Recurso | Encontrados | Importados | Validados | Pendentes |", "|---|---:|---:|---:|---:|"]
    for row in report["rows"]:
        text.append(f"| {row['label']} | {row['found']} | {row['imported']} | {row['validated']} | {row['pending']} |")
    text.extend(["", *report["limitations"], ""])
    return "\n".join(text)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--campaign", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    data = json.loads(args.campaign.read_text(encoding="utf-8")) if args.campaign else None
    if data and (data.get("source", {}).get("synthetic") or data.get("source", {}).get("fixture")):
        parser.error("Fixtures sintéticas não podem virar cobertura do jogo.")
    report = coverage(data)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(markdown(report), encoding="utf-8")
    args.output.with_suffix(".json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(args.output)
