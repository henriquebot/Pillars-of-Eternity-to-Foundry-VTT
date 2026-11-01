"""Produce bounded import bundles while keeping full extracts separately auditable."""
from __future__ import annotations

import copy
import fnmatch
import math
from pathlib import Path

from .parsers import SourceError
from .pipeline import KINDS, now, validate

MAX_IMPORT_BYTES = 50 * 1024 * 1024
MAX_IMPORT_VALUES = 500_000
MAX_IMPORT_DEPTH = 40


def _check_limits(payload: dict) -> dict:
    """Use the same safety limits as foundry/scripts/model.mjs."""
    stack = [(payload, 0)]
    count = 0
    depth_seen = 0
    while stack:
        value, depth = stack.pop()
        count += 1
        depth_seen = max(depth_seen, depth)
        if count > MAX_IMPORT_VALUES or depth > MAX_IMPORT_DEPTH:
            raise SourceError("Import bundle exceeds 500000 values or 40 levels. "
                              "Use narrower --select-source filters and create several bundles.")
        if isinstance(value, float) and not math.isfinite(value):
            raise SourceError("Import bundle contains a non-finite number")
        if isinstance(value, str) and len(value) > 2_000_000:
            raise SourceError("Import bundle contains a string longer than 2000000 characters")
        if isinstance(value, dict):
            if {"__proto__", "prototype", "constructor"} & value.keys():
                raise SourceError("Import bundle contains a prohibited object key")
            stack.extend((child, depth + 1) for child in value.values())
        elif isinstance(value, list):
            stack.extend((child, depth + 1) for child in value)
    import json
    encoded = json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")
    if len(encoded) + 1 > MAX_IMPORT_BYTES:
        raise SourceError("Import bundle exceeds 50 MiB. Use narrower --select-source filters.")
    return {"bytes": len(encoded) + 1, "values": count, "depth": depth_seen}


def make_package(campaign: dict, *, patterns: tuple[str, ...] = (), kinds: tuple[str, ...] = (),
                 include_related: bool = True, original_path: Path | None = None,
                 original_sha256: str | None = None) -> dict:
    errors = validate(campaign)
    if errors:
        raise SourceError("Cannot package invalid IR: " + "; ".join(errors[:10]))
    if any(kind not in KINDS for kind in kinds):
        raise SourceError("Unknown entity kind in package selection")
    def matches(entity: dict) -> bool:
        source_id = entity.get("sourceId", entity["id"])
        return ((not kinds or entity["kind"] in kinds) and
                (not patterns or any(fnmatch.fnmatchcase(source_id.lower(), p.lower()) for p in patterns)))
    selected = {entity["id"] for entity in campaign["entities"] if matches(entity)}
    if not selected:
        raise SourceError("No entities matched the package selection; inspect source IDs first")
    by_id = {entity["id"]: entity for entity in campaign["entities"]}
    if include_related:
        queue = list(selected)
        while queue:
            entity_id = queue.pop()
            entity = by_id[entity_id]
            for reference in entity["data"].get("references", []):
                target = reference.get("id")
                if target in by_id and target not in selected:
                    selected.add(target)
                    queue.append(target)
    entities = [copy.deepcopy(entity) for entity in campaign["entities"] if entity["id"] in selected]
    for entity in entities:
        data = entity["data"]
        data.pop("sourceTree", None)
        for node in data.get("nodes", []):
            node.pop("source", None)
            for link in node.get("links", []):
                # Other link fields are retained once in canonical metadata.
                link.pop("source", None)
            for script in node.get("scripts", []):
                # Conditions and call signatures/parameters are retained, never evaluated.
                script.pop("source", None)
    source = copy.deepcopy({key: value for key, value in campaign["source"].items() if key != "tables"})
    original = {"path": str(original_path.resolve()) if original_path else None,
                "sha256": original_sha256,
                "containsFullSourceTreesAndTables": bool(campaign["source"].get("tables"))}
    source["importPackage"] = {"createdAt": now(), "selection": {"sourceGlobs": list(patterns),
                               "kinds": list(kinds), "includeRelated": include_related},
                               "originalExtract": original,
                               "removed": ["source.tables", "data.sourceTree", "nodes.source",
                                           "links.source", "scripts.source"],
                               "originalEntityCount": len(campaign["entities"])}
    selected_paths = {e["provenance"].get("path") for e in entities}
    diagnostics = [copy.deepcopy(d) for d in campaign.get("diagnostics", []) if d.get("path") in selected_paths]
    package = {"schemaVersion": campaign["schemaVersion"], "id": campaign["id"], "source": source,
               "entities": entities, "diagnostics": diagnostics}
    # Include limits in the saved bundle and then validate/count the complete object.
    source["importPackage"]["limits"] = {"bytes": MAX_IMPORT_BYTES, "values": MAX_IMPORT_VALUES,
                                          "depth": MAX_IMPORT_DEPTH, "entities": 50_000}
    if len(entities) > 50_000:
        raise SourceError("Import bundle exceeds 50000 entities")
    _check_limits(package)
    return package
