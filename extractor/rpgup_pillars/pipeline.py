"""Extraction, provenance, validation and local JSON output."""
from __future__ import annotations

import hashlib
import json
import os
import shutil
import tempfile
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from . import __version__
from .parsers import MAX_XML_BYTES, SourceError, parse_flow, parse_stringtable, quest_text
from .scanner import DATA_FOLDER, PACKAGES, inventory, is_link, walk_files

KINDS = ("map", "pin", "npc", "item", "container", "quest", "dialogue", "transition", "encounter", "lore")
STATUSES = {"extracted", "converted", "adapted", "manual", "pending", "unsupported"}
NAMESPACE = uuid.UUID("ab8c4c64-0174-4c88-93bf-330caee4df35")


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def stable_id(kind: str, source_id: str) -> str:
    canonical = source_id.replace("\\", "/").strip("/").lower()
    return str(uuid.uuid5(NAMESPACE, f"pillars-of-eternity:{kind}:{canonical}"))


def _provenance(path: Path, source_id: str, raw: bytes, timestamp: str, synthetic: bool) -> dict:
    return {"source": "synthetic-fixture" if synthetic else "local-game", "path": str(path),
            "sourceId": source_id, "sha256": hashlib.sha256(raw).hexdigest(),
            "extractedAt": timestamp, "status": "extracted", "extractorVersion": __version__}


def _read(path: Path) -> bytes:
    if is_link(path):
        raise SourceError("Linked source files are prohibited")
    if path.stat().st_size > MAX_XML_BYTES:
        raise SourceError(f"Source exceeds {MAX_XML_BYTES} byte parser limit")
    with path.open("rb") as stream:
        raw = stream.read(MAX_XML_BYTES + 1)
    if len(raw) > MAX_XML_BYTES:
        raise SourceError("Source grew beyond parser size limit")
    return raw


def _locale(raw: str) -> str:
    return "pt-BR" if raw.lower() == "pt-br" else raw


def _text_metadata(path: Path, data_root: Path) -> tuple[str, str, str] | None:
    parts = path.relative_to(data_root).parts
    # data[/_expansionN]/localized/<language>/text/<relative table>
    if len(parts) >= 6 and parts[0] in PACKAGES and parts[1] in {"localized", "localised"} and parts[3] == "text":
        return parts[0], _locale(parts[2]), Path(*parts[4:]).as_posix()
    return None


def _snapshot(target: Path, raw: bytes, *, audit_root: Path, game_root: Path) -> str:
    """Keep exact XML bytes outside the game, without redundant JSON source trees."""
    resolved = target.resolve()
    if resolved.is_relative_to(game_root.resolve()) or not resolved.is_relative_to(audit_root.resolve()):
        raise SourceError("Source snapshots must stay in the audit directory outside the game")
    if target.exists() and (is_link(target) or not target.is_file()):
        raise SourceError("Source snapshot target must be a regular file")
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.read_bytes() == raw:
            return str(resolved)
        backup = target.with_name(target.name + f".{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.bak")
        shutil.copy2(target, backup)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("wb", dir=target.parent, prefix=".rpgup-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return str(resolved)


def extract(root: Path, *, language: str = "pt-BR", max_files: int = 100_000,
            source_detail: str = "inline", audit_dir: Path | None = None,
            all_languages: bool = False) -> dict:
    if is_link(root):
        raise SourceError("Installation root must not be a link or junction")
    root = root.resolve()
    data_root = root if root.name == DATA_FOLDER else root / DATA_FOLDER
    if not data_root.is_dir() or is_link(data_root):
        raise SourceError(f"No readable {DATA_FOLDER} directory at {root}")
    game_root = data_root.parent
    if source_detail not in {"inline", "sidecar"}:
        raise SourceError("source_detail must be inline or sidecar")
    if source_detail == "sidecar":
        if audit_dir is None:
            raise SourceError("Sidecar source detail requires an audit directory")
        if audit_dir.resolve().is_relative_to(game_root):
            raise SourceError("Audit directory must be outside the original game installation")
    synthetic = (game_root / ".rpgup-synthetic").is_file()
    timestamp = now()
    diagnostics = []
    paths = list(walk_files(data_root, max_files=max_files))
    tables: dict[tuple[str, str, str], dict] = {}
    table_records = []
    duplicates: dict[str, list[str]] = {}
    requested_languages = list(dict.fromkeys(("en", _locale(language))))
    available_languages = sorted({metadata[1] for p in paths if p.suffix.lower() == ".stringtable"
                                  if (metadata := _text_metadata(p, data_root)) is not None})

    def snapshot(path: Path, raw: bytes, provenance: dict):
        if source_detail == "sidecar":
            provenance["snapshotPath"] = _snapshot(audit_dir / path.relative_to(data_root), raw,
                                                    audit_root=audit_dir, game_root=game_root)

    def issue(severity: str, code: str, path: Path | str, message: str):
        diagnostics.append({"severity": severity, "code": code, "path": str(path), "message": message})

    for path in paths:
        if path.suffix.lower() != ".stringtable":
            continue
        metadata = _text_metadata(path, data_root)
        if not all_languages and metadata and metadata[1] not in requested_languages:
            continue
        try:
            raw = _read(path)
            parsed = parse_stringtable(raw)
            relative = path.relative_to(data_root).as_posix()
            provenance = _provenance(path, relative, raw, timestamp, synthetic)
            snapshot(path, raw, provenance)
            record = {"id": stable_id("stringtable", relative), "path": relative,
                      "provenance": provenance, **parsed}
            if metadata:
                package, locale, table_path = metadata
                record.update({"package": package, "language": locale, "tablePath": table_path})
                tables[(package, locale, table_path)] = record
            else:
                issue("warning", "unclassified-stringtable", path,
                      "XML preserved, but path does not identify its locale or narrative association")
            table_records.append(record)
            duplicates.setdefault(provenance["sha256"], []).append(relative)
            for warning in parsed["warnings"]:
                issue("warning", "stringtable-warning", path, warning)
        except (OSError, SourceError) as exc:
            issue("error", "stringtable-unreadable", path, str(exc))

    def merged(table_path: str, requested: str) -> dict[int, dict]:
        result = {}
        for package in PACKAGES:
            record = tables.get((package, requested, table_path))
            fallback = record is None and requested != "en"
            if record is None:
                record = tables.get((package, "en", table_path))
            if record is None:
                continue
            for source_id, text in record["entries"].items():
                result[source_id] = {**text, "language": record["language"],
                                     "requestedLanguage": requested, "translationMissing": fallback,
                                     "provenance": {**record["provenance"], "entryId": source_id}}
        return result

    entities_by_key: dict[tuple[str, str], dict] = {}
    if all_languages:
        requested_languages = list(dict.fromkeys((*requested_languages, *available_languages)))
    narrative_paths = sorted((p for p in paths if p.suffix.lower() in {".quest", ".conversation"}),
                             key=lambda p: (PACKAGES.index(p.relative_to(data_root).parts[0])
                                            if p.relative_to(data_root).parts[0] in PACKAGES else -1, str(p)))
    for path in narrative_paths:
        kind = "quest" if path.suffix.lower() == ".quest" else "dialogue"
        try:
            raw = _read(path)
            parsed = parse_flow(raw, quest=kind == "quest", preserve_source=source_detail == "inline")
            relative = path.relative_to(data_root)
            source_relative = Path(*relative.parts[1:]) if relative.parts[0] in PACKAGES else relative
            source_id = source_relative.with_suffix("").as_posix()
            texts_path = source_relative.with_suffix(".stringtable").as_posix()
            localized = {locale: merged(texts_path, locale) for locale in requested_languages}
            names = {"en": path.stem}
            if kind == "quest":
                for locale, entries in localized.items():
                    title = entries.get(0)
                    if title and not title["translationMissing"] and title["defaultText"]:
                        names[locale] = title["defaultText"]
                parsed["texts"] = {locale: quest_text(entries, parsed["nodes"])
                                   for locale, entries in localized.items()}
            for node in parsed["nodes"]:
                node["texts"] = {locale: entries[node["id"]] for locale, entries in localized.items()
                                 if node["id"] in entries}
                # PoE1's conversation root (ID 0) normally routes flow without a text entry.
                if not node["texts"] and node["id"] != 0 and node["type"] in {"TalkNode", "PlayerResponseNode"}:
                    parsed["warnings"].append(f"Missing stringtable text for node {node['id']}")
            if not any(localized.values()):
                parsed["warnings"].append("No associated stringtable found")
            references = []
            for node in parsed["nodes"]:
                for script in node["scripts"]:
                    for parameter in script["parameters"]:
                        normalized = parameter.replace("\\", "/")
                        if normalized.lower().endswith(".quest") and "/quests/" in normalized.lower():
                            # Preserve the literal parameter and expose a structural relation only.
                            index = normalized.lower().index("/quests/") + 1
                            quest_id = normalized[index:-6]
                            references.append({"kind": "quest", "id": stable_id("quest", quest_id),
                                               "sourceId": quest_id, "nodeId": node["id"],
                                               "function": script["function"], "literal": parameter,
                                               "interpreted": False})
            parsed["references"] = references
            entity = {"id": stable_id(kind, source_id), "kind": kind, "sourceId": source_id,
                      "name": names, "provenance": _provenance(path, source_id, raw, timestamp, synthetic),
                      "data": {**parsed, "translation": {"requested": language,
                                "policy": "fallback content explicitly tagged with actual language"}}}
            snapshot(path, raw, entity["provenance"])
            key = (kind, source_id.lower())
            if key in entities_by_key:
                issue("warning", "narrative-overlay", path,
                      "Later package replaces a narrative file with the same stable source identifier")
                entity["data"]["overlaySources"] = [entities_by_key[key]["provenance"]]
            entities_by_key[key] = entity
            duplicates.setdefault(entity["provenance"]["sha256"], []).append(relative.as_posix())
            for warning in parsed["warnings"]:
                issue("warning", "narrative-warning", path, warning)
        except (OSError, SourceError) as exc:
            issue("error", "narrative-unreadable", path, str(exc))
    entities = sorted(entities_by_key.values(), key=lambda e: (e["kind"], e["sourceId"]))
    ids = {e["id"] for e in entities}
    for entity in entities:
        for reference in entity["data"]["references"]:
            if reference["id"] not in ids:
                issue("warning", "quest-reference-unresolved", entity["provenance"]["path"], reference["literal"])
    counts = Counter(entity["kind"] for entity in entities)
    binary_count = sum(1 for p in paths if p.suffix.lower() in {".assets", ".assetbundle", ".unity3d", ".bundle"})
    if binary_count:
        issue("warning", "unity-not-extracted", str(data_root),
              f"{binary_count} Unity binaries inventoried; image reconstruction and scene geometry are pending")
    return {"schemaVersion": "1.0.0", "id": "rpgup-pillars-campaign",
            "source": {"game": "pillars-of-eternity", "root": str(game_root), "language": language,
                       "extractedAt": timestamp, "extractorVersion": __version__, "synthetic": synthetic,
                       "sourceDetail": source_detail, "auditDirectory": str(audit_dir.resolve()) if audit_dir else None,
                       "availableLanguages": available_languages, "allLanguagesRequested": all_languages,
                       "packages": [p for p in PACKAGES if (data_root / p).is_dir()],
                       "tables": table_records},
            "entities": entities, "diagnostics": diagnostics,
            "coverage": {"scope": "synthetic-fixtures" if synthetic else "local-source-extraction",
                         "rows": [{"kind": kind, "found": sum(p.suffix.lower() == (".quest" if kind == "quest" else ".conversation")
                                                               for p in narrative_paths) if kind in {"quest", "dialogue"} else 0,
                                   "extracted": counts[kind], "imported": 0, "validatedInFoundry": 0,
                                   "pending": counts[kind]} for kind in KINDS],
                         "textTablesRead": len(table_records), "sourceFilesInspected": len(paths),
                         "note": "Other kinds are unclassified, not proven absent. No Foundry validation has run."},
            "duplicateContent": [{"sha256": digest, "paths": names}
                                 for digest, names in duplicates.items() if len(names) > 1]}


def validate(campaign: object) -> list[str]:
    """Runtime minimum checks matching campaign.schema.json, plus uniqueness."""
    errors: list[str] = []
    if not isinstance(campaign, dict):
        return ["Campaign must be an object"]
    if campaign.get("schemaVersion") != "1.0.0":
        errors.append("Unsupported schemaVersion")
    if not isinstance(campaign.get("id"), str) or not campaign["id"] or len(campaign["id"]) > 256:
        errors.append("Campaign id must be a nonempty string up to 256 characters")
    if not isinstance(campaign.get("source"), dict):
        errors.append("source must be an object")
    entities = campaign.get("entities")
    if not isinstance(entities, list) or len(entities) > 100_000:
        return errors + ["entities must be an array of at most 100000 entries"]
    seen = set()
    for index, entity in enumerate(entities):
        prefix = f"entities[{index}]"
        if not isinstance(entity, dict):
            errors.append(f"{prefix} must be an object")
            continue
        entity_id = entity.get("id")
        if not isinstance(entity_id, str) or not entity_id or len(entity_id) > 256:
            errors.append(f"{prefix}.id must be a nonempty string up to 256 characters")
        elif entity_id in seen:
            errors.append(f"{prefix}.id is duplicated")
        else:
            seen.add(entity_id)
        if entity.get("kind") not in KINDS:
            errors.append(f"{prefix}.kind is unsupported")
        if "sourceId" in entity and not isinstance(entity["sourceId"], str):
            errors.append(f"{prefix}.sourceId must be a string")
        name = entity.get("name")
        if not isinstance(name, dict) or not name or not all(isinstance(v, str) for v in name.values()):
            errors.append(f"{prefix}.name must contain localized strings")
        if not isinstance(entity.get("data"), dict):
            errors.append(f"{prefix}.data must be an object")
        provenance = entity.get("provenance")
        if not isinstance(provenance, dict):
            errors.append(f"{prefix}.provenance must be an object")
            continue
        for field in ("source", "sourceId", "extractedAt"):
            if not isinstance(provenance.get(field), str):
                errors.append(f"{prefix}.provenance.{field} must be a string")
        if provenance.get("status") not in STATUSES:
            errors.append(f"{prefix}.provenance.status is unsupported")
        digest = provenance.get("sha256")
        if digest is not None and (not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest)):
            errors.append(f"{prefix}.provenance.sha256 is invalid")
    return errors


def write_json(target: Path, payload: dict, *, forbidden_roots: tuple[Path, ...] = ()) -> Path | None:
    """Atomic output with a backup; categorically refuse writes inside game installs."""
    target = target.expanduser()
    resolved = target.resolve()
    for source in forbidden_roots:
        if resolved.is_relative_to(source.resolve()):
            raise SourceError("Output must be outside the original game installation")
    if target.exists() and (is_link(target) or not target.is_file()):
        raise SourceError("Output must be a regular file, never a link or directory")
    target.parent.mkdir(parents=True, exist_ok=True)
    backup = None
    if target.exists():
        backup = target.with_name(target.name + f".{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')}.bak")
        shutil.copy2(target, backup)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="\n", dir=target.parent,
                                         prefix=".rpgup-", suffix=".tmp", delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()
    return backup
